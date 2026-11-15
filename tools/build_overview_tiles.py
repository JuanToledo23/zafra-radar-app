"""Overview tiles missing from the research library's NISAR tile sets, built by the app.

    <library>/.venv/bin/python tools/build_overview_tiles.py --site morelos|brazil|all
        [--library PATH] [--out data/derived]

The library's overview zooms 10-13 lack the easternmost tile column whose zoom-14 tiles exist
(DATA.md, "Raster tiles"). For every layer of a site's tiles_index.json and each zoom from 13
down to 10, a tile that is missing in the library but has at least one child at the next zoom
(in the library, or built here one zoom deeper) is built from its four children: their palette
indices are read back to values on the layer's stretch, mosaicked to 512 x 512, averaged over
2 x 2 blocks ignoring nodata (as the library's zafra.rasters.block_mean does for overviews) and
written as a 256 x 256 palette PNG with the child tiles' own palette, index 0 transparent.
Tiles built at one zoom are kept as values, not re-read from PNG, for the next zoom up.

Writes <out>/tiles/<site>/<layer>/{z}/{x}/{y}.png and <out>/tiles/<site>/derived_tiles.json
(library commit, tiles built per zoom and layer); data/derived/ is git-ignored. Nothing is ever
written inside the library, and a tile the library has is never built. Needs numpy and Pillow,
both in the library's environment; no library code is imported.
"""

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

sys.dont_write_bytecode = True

APP_ROOT = Path(__file__).resolve().parents[1]
SITES = ("morelos", "brazil")
TILES_DIR = "data/tiles"  # relative to the library root, as scripts/18_web_rasters.py writes
INDEX = "tiles_index.json"
MANIFEST = "derived_tiles.json"
OVERVIEW_ZOOMS = (13, 12, 11, 10)  # built in this order: each from the zoom below it
TILE_PX = 256


def log(msg: str) -> None:
    print(msg, flush=True)


def git(lib: Path, *args: str) -> str:
    return subprocess.run(["git", "--no-optional-locks", "-C", str(lib), *args],
                          check=True, capture_output=True, text=True).stdout.strip()


def library_state(lib: Path) -> dict:
    return {"commit": git(lib, "rev-parse", "HEAD"),
            "commit_short": git(lib, "rev-parse", "--short", "HEAD"),
            "dirty": bool(git(lib, "status", "--porcelain"))}


# ------------------------------------------------------------------------- tile arithmetic


def children(x: int, y: int) -> list[tuple[int, int, int, int]]:
    """The four tiles one zoom deeper as (cx, cy, column, row) in the 2 x 2 mosaic."""
    return [(2 * x + i, 2 * y + j, i, j) for j in (0, 1) for i in (0, 1)]


def parent(x: int, y: int) -> tuple[int, int]:
    return x // 2, y // 2


def candidates(have_child: set[tuple[int, int]], have: set[tuple[int, int]]) -> list[tuple[int, int]]:
    """Tiles (x, y) at zoom z that are not in `have` (the library's zoom-z tiles) but have at
    least one child in `have_child` (every zoom-(z+1) tile, library or built)."""
    return sorted({parent(x, y) for x, y in have_child} - have)


def tile_x_range_lon(xs, z: int) -> tuple[float, float]:
    """Longitude of the west edge of min(xs) and of the east edge of max(xs) at zoom z."""
    n = 2 ** z
    return min(xs) / n * 360 - 180, (max(xs) + 1) / n * 360 - 180


def gap_km(lib_xs, full_xs, z: int, lat: float) -> float:
    """East-west distance (km, at latitude `lat`) between the east edge of the last zoom-z
    column and the east edge of the columns `full_xs` cover."""
    east = tile_x_range_lon(lib_xs, z)[1]
    full_east = tile_x_range_lon(full_xs, z)[1]
    return max(full_east - east, 0.0) * 111.32 * np.cos(np.radians(lat))


# ------------------------------------------------------------------------------- pixels


def to_values(idx: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """Palette indices back to values: 1..255 along [lo, hi] (inverse of the library's
    zafra.rasters.to_index); index 0 (nodata) -> NaN."""
    v = lo + (idx.astype("float64") - 1) / 254 * (hi - lo)
    return np.where(idx == 0, np.nan, v)


def to_index(v: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """Values to palette indices 1..255 over [lo, hi]; NaN -> 0 (as zafra.rasters.to_index)."""
    t = (v - lo) / (hi - lo)
    idx = 1 + np.round(np.clip(np.nan_to_num(t), 0, 1) * 254)
    return np.where(np.isfinite(t), idx, 0).astype("uint8")


def downsample(mosaic: np.ndarray) -> np.ndarray:
    """2 x 2 block mean ignoring NaN; NaN where a whole block is nodata."""
    h, w = mosaic.shape
    blocks = mosaic.reshape(h // 2, 2, w // 2, 2)
    valid = np.isfinite(blocks)
    n = valid.sum(axis=(1, 3))
    s = np.where(valid, blocks, 0).sum(axis=(1, 3))
    return np.where(n > 0, s / np.maximum(n, 1), np.nan)


def mosaic(parts: dict[tuple[int, int], np.ndarray]) -> np.ndarray:
    """2 x 2 mosaic of child tiles keyed by (column, row); missing children are nodata."""
    out = np.full((2 * TILE_PX, 2 * TILE_PX), np.nan)
    for (i, j), tile in parts.items():
        out[j * TILE_PX:(j + 1) * TILE_PX, i * TILE_PX:(i + 1) * TILE_PX] = tile
    return out


def read_tile(path: Path, lo: float, hi: float) -> tuple[np.ndarray, list[int]]:
    with Image.open(path) as img:
        if img.mode != "P" or img.size != (TILE_PX, TILE_PX):
            raise ValueError(f"{path}: expected a {TILE_PX}-pixel palette PNG, got {img.mode} {img.size}")
        return to_values(np.asarray(img), lo, hi), img.getpalette()


def write_tile(path: Path, values: np.ndarray, lo: float, hi: float, pal: list[int]) -> int:
    img = Image.fromarray(to_index(values, lo, hi), mode="P")
    img.putpalette(pal)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="PNG", optimize=True, transparency=0)
    return path.stat().st_size


# ---------------------------------------------------------------------------------- build


def library_tiles(layer_dir: Path, z: int) -> set[tuple[int, int]]:
    zdir = layer_dir / str(z)
    if not zdir.is_dir():
        return set()
    return {(int(p.parent.name), int(p.stem)) for p in zdir.glob("*/*.png")}


def build_layer(lib_layer: Path, out_layer: Path, stretch, zooms=OVERVIEW_ZOOMS) -> dict:
    """Build the missing overview tiles of one layer; returns {z: [(x, y), ...]} built."""
    lo, hi = stretch
    built: dict[int, dict[tuple[int, int], np.ndarray]] = {}
    pal = None
    for z in zooms:
        have = library_tiles(lib_layer, z)
        below = library_tiles(lib_layer, z + 1) | set(built.get(z + 1, {}))
        built[z] = {}
        for x, y in candidates(below, have):
            parts = {}
            for cx, cy, i, j in children(x, y):
                if (cx, cy) in built.get(z + 1, {}):
                    parts[i, j] = built[z + 1][cx, cy]
                elif (cx, cy) in below:
                    parts[i, j], pal = read_tile(lib_layer / str(z + 1) / str(cx) / f"{cy}.png", lo, hi)
            values = downsample(mosaic(parts))
            if not np.isfinite(values).any():
                continue
            if pal is None:  # every child was built here: any library tile of the layer has the palette
                pal = read_tile(next(lib_layer.glob("*/*/*.png")), lo, hi)[1]
            write_tile(out_layer / str(z) / str(x) / f"{y}.png", values, lo, hi, pal)
            built[z][x, y] = values
    return {z: sorted(tiles) for z, tiles in built.items()}


def build_site(site: str, lib: Path, out: Path, state: dict) -> dict:
    src = lib / TILES_DIR / site
    index = json.loads((src / INDEX).read_text())
    dst = out / "tiles" / site
    t0 = time.time()
    per_layer, per_zoom = {}, {z: 0 for z in OVERVIEW_ZOOMS}
    for layer in index["layers"]:
        built = build_layer(src / layer["id"], dst / layer["id"], layer["stretch"])
        per_layer[layer["id"]] = {str(z): len(t) for z, t in built.items()}
        for z, t in built.items():
            per_zoom[z] += len(t)
    manifest = {
        "site": site,
        "generated_at": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "tool": "tools/build_overview_tiles.py",
        "library": {**state, "index": f"{TILES_DIR}/{site}/{INDEX}"},
        "method": "missing zoom 10-13 tiles with at least one child: 2 x 2 mosaic of the "
                  "children (library or built), palette indices read back to values on the "
                  "layer's stretch, 2 x 2 mean ignoring nodata, same palette",
        "zooms": list(OVERVIEW_ZOOMS),
        "tiles_by_zoom": {str(z): n for z, n in per_zoom.items()},
        "tiles": sum(per_zoom.values()),
        "layers": per_layer,
    }
    (dst / MANIFEST).write_text(json.dumps(manifest, indent=1) + "\n")
    log(f"[{site}] built {manifest['tiles']} tiles {manifest['tiles_by_zoom']} "
        f"in {time.time() - t0:.1f} s -> {dst}")
    return manifest


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
    for site in SITES if args.site == "all" else (args.site,):
        build_site(site, lib, out, state)
    if library_state(lib)["dirty"] != state["dirty"]:
        raise RuntimeError(f"the library checkout changed while running: {lib}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
