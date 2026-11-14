"""Per-segment alert table for every cane segment of a site, computed by the research library.

    <library>/.venv/bin/python tools/build_alerts.py --site morelos|brazil|all
        [--library PATH] [--out data/derived]

Runs with the research library's Python environment and imports its code; no rule is
reimplemented here. For each site it calls, from the library's
scripts/17_field_summaries.py (step 1 of that script), `delivered_layer` and `facts_table`,
which compute the facts (zafra.summary.field_facts) and the alerts (zafra.alerts.evaluate)
of every gated cane segment of the delivered harvest layer. The rule definitions are the
library's own text, taken from the "Rules" block of the zafra.alerts docstring.

Writes <out>/alerts_<site>.json (data/derived/ is git-ignored): the library commit it ran
against, the layer, per-code totals, each code's severity, parameters and definition, and
one row per alert {segment_id, code, severity, evidence}. Nothing is written inside the
library (no bytecode either); `git status` there is run without taking the index lock.
"""

import argparse
import datetime as dt
import importlib.util
import inspect
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True  # importing the library must not write __pycache__ into it

APP_ROOT = Path(__file__).resolve().parents[1]
SITES = ("morelos", "brazil")
SCRIPT = "scripts/17_field_summaries.py"
RULES_HEADER = "Rules (parameters in brackets):"
CODE_LINE = re.compile(r"^  ([A-Z][A-Z_]+)(?:\s+(.*))?$")


def log(msg: str) -> None:
    print(msg, flush=True)


def git(lib: Path, *args: str) -> str:
    return subprocess.run(["git", "--no-optional-locks", "-C", str(lib), *args],
                          check=True, capture_output=True, text=True).stdout.strip()


def library_state(lib: Path) -> dict:
    status = git(lib, "status", "--porcelain")
    return {"commit": git(lib, "rev-parse", "HEAD"),
            "commit_short": git(lib, "rev-parse", "--short", "HEAD"),
            "dirty": bool(status)}


def import_library(lib: Path):
    """(zafra.alerts, script 17 module), both from the checkout at `lib`."""
    sys.path.insert(0, str(lib / "src"))
    from zafra import alerts as A

    if not Path(A.__file__).resolve().is_relative_to(lib.resolve()):
        raise RuntimeError(f"zafra imported from {A.__file__}, not from {lib}")
    spec = importlib.util.spec_from_file_location("field_summaries", lib / SCRIPT)
    s17 = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(s17)  # module level only defines; main() is not run
    return A, s17


def rule_definitions(module) -> dict:
    """{code: {definition, definition_source}} from the "Rules" block of the module docstring:
    a code at two-space indent starts an entry, deeper-indented lines continue it.
    `definition_source` is file:first-last line of the entry."""
    src_path = Path(inspect.getsourcefile(module))
    lines = src_path.read_text().splitlines()
    start = lines.index(RULES_HEADER) + 1
    out, code = {}, None
    for i in range(start, len(lines)):
        line = lines[i]
        if not line.strip():
            break
        m = CODE_LINE.match(line)
        if m:
            code = m.group(1)
            out[code] = {"parts": [m.group(2) or ""], "first": i + 1, "last": i + 1}
        elif code:
            out[code]["parts"].append(line.strip())
            out[code]["last"] = i + 1
    rel = src_path.relative_to(src_path.parents[2])  # src/zafra/alerts.py
    return {c: {"definition": " ".join(" ".join(e["parts"]).split()),
                "definition_source": f"{rel}:{e['first']}-{e['last']}"} for c, e in out.items()}


def build_site(name: str, lib: Path, A, s17, state: dict, definitions: dict) -> dict:
    from zafra.site import load_site

    t0 = time.perf_counter()
    site = load_site(name)
    import geopandas as gpd

    layer = s17.delivered_layer(site)
    seg = gpd.read_file(layer)
    is_cane = seg["cane_pred"].fillna(False).astype(bool)
    cane_ids = sorted(seg.loc[is_cane, "seg_id"])
    log(f"[{name}] {len(seg)} segments, {len(cane_ids)} gated cane, from {layer}")
    table = s17.facts_table(seg, cane_ids, site)  # {seg_id: (facts, alerts)}
    counts = s17.alert_counts(table, seg)

    rows = [{"segment_id": str(sid), "code": a["code"], "severity": a["severity"],
             "evidence": a["evidence"]}
            for sid in cane_ids for a in table[sid][1]]
    rules = site.alerts.get("rules") or {}
    codes = {}
    for c in A.CODES:
        p = rules.get(c) or {}
        enabled = bool(p.get("enabled", False))
        codes[c] = {
            "enabled": enabled,
            "severity": p.get("severity", "info"),
            "params": {k: v for k, v in p.items() if k not in ("enabled", "severity")},
            "count": sum(r["code"] == c for r in rows),
            **definitions[c],
        }
    log(f"[{name}] {len(rows)} alerts: "
        + ", ".join(f"{c} {v['count']}" + ("" if v["enabled"] else " (disabled)")
                    for c, v in codes.items())
        + f" ({time.perf_counter() - t0:.0f} s)")
    return {
        "site": name,
        "generated_at": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "generator": "tools/build_alerts.py",
        "library": {**state, "script": SCRIPT, "rules_module": "zafra.alerts"},
        "layer": str(Path(layer).relative_to(lib)),
        "burn_window": site.alerts.get("burn_window"),
        "cane_segments": counts["cane_segments"],
        "segments_with_alert": counts["segments_with_alert"],
        "segments_with_warning": counts["segments_with_warning"],
        "per_code": counts["per_code"],
        "codes": codes,
        "alerts": rows,
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--site", required=True, choices=(*SITES, "all"))
    ap.add_argument("--library", default=os.environ.get("ZAFRA_DATA"),
                    help="research library checkout (default: $ZAFRA_DATA)")
    ap.add_argument("--out", default=str(APP_ROOT / "data" / "derived"))
    args = ap.parse_args(argv)
    if not args.library or not Path(args.library).is_dir():
        ap.error("--library (or ZAFRA_DATA) must be the research library checkout")
    lib = Path(args.library).resolve()
    out = Path(args.out).resolve()
    if out.is_relative_to(lib):
        ap.error(f"--out {out} is inside the library; it must stay read-only")

    state = library_state(lib)
    log(f"library {lib} at {state['commit_short']}" + (" (DIRTY)" if state["dirty"] else ""))
    A, s17 = import_library(lib)
    definitions = rule_definitions(A)
    missing = set(A.CODES) - set(definitions)
    if missing:
        raise RuntimeError(f"no definition in the zafra.alerts docstring for {sorted(missing)}")
    out.mkdir(parents=True, exist_ok=True)
    for name in SITES if args.site == "all" else (args.site,):
        result = build_site(name, lib, A, s17, state, definitions)
        path = out / f"alerts_{name}.json"
        path.write_text(json.dumps(result, ensure_ascii=False, indent=1, default=str) + "\n")
        log(f"[{name}] wrote {path}")
    if library_state(lib)["dirty"] != state["dirty"]:
        raise RuntimeError(f"the library checkout changed while running: {lib}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
