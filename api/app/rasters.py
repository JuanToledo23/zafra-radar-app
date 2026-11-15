"""NISAR raster tile sets of the research library (exercise 9, scripts/18_web_rasters.py):
`<ZAFRA_DATA>/data/tiles/<site>/tiles_index.json` and palette PNG tiles
`<layer>/{z}/{x}/{y}.png` next to it. Read-only; nothing here touches the database.

The colour meanings and the attribution are the library's own text, cited by file and line
(library commit 0d6b064); the stretch and ramp of each layer come from its index entry."""

import json
import os
import re
from pathlib import Path

TILES_DIR = "data/tiles"  # relative to ZAFRA_DATA, where scripts/18_web_rasters.py writes
INDEX = "tiles_index.json"
NAME = re.compile(r"^[a-z0-9_]+$")  # site ids and layer ids of the index

PRODUCTS = {"hv": "HV", "hh": "HH", "cross": "cross-ratio", "change": "change"}

# What brighter / darker (or blue / red) mean, per index `kind`. "season" is the change
# layer over all six dates (hv_change_season), which has its own definition.
MEANING = {
    "hv": {
        "text": "Brighter = stronger HV backscatter, as from tall, structured vegetation such "
                "as standing cane; darker = weaker, as from smooth bare soil or calm water. When "
                "cane is cut, HV (cross-pol) usually drops sharply.",
        "source": "zafra-radar-research docs/GLOSSARY.md:11-13 (backscatter), :31-33 "
                  "(cross-pol); grey ramp: docs/METHODS.md:395, :404",
    },
    "hh": {
        "text": "Brighter = stronger HH backscatter, as from rough surfaces and tall, structured "
                "vegetation; darker = weaker, as from smooth bare soil or calm water.",
        "source": "zafra-radar-research docs/GLOSSARY.md:11-13 (backscatter); grey ramp: "
                  "docs/METHODS.md:396, :404",
    },
    "cross": {
        "text": "HV minus HH. Brighter = higher cross-ratio (cane about -5 to -6 dB); darker = "
                "lower, as over bare soil or water.",
        "source": "zafra-radar-research src/zafra/rasters.py:50; grey ramp: "
                  "docs/METHODS.md:396, :404",
    },
    "change": {
        "text": "HV of the later date minus HV of the earlier one. Blue = HV fell (loss of "
                "volume scattering, e.g. a cut); white = no change (0 dB); red = HV rose.",
        "source": "zafra-radar-research src/zafra/rasters.py:65, :101; docs/METHODS.md:397-399, "
                  ":404",
    },
    "season": {
        "text": "Lowest HV over the six dates minus the first date: blue = the deepest drop so "
                "far (e.g. a cut), near white = little change. Stable ground reads about -1 dB "
                "rather than 0, because the minimum is taken over speckled values.",
        "source": "zafra-radar-research src/zafra/rasters.py:106; docs/METHODS.md:399-401, :404",
    },
}

ATTRIBUTION = {
    "text": "NISAR L2 GCOV (Provisional): NASA/JPL-ISRO NISAR Project, distributed by ASF DAAC",
    "source": "zafra-radar-research docs/DATA_SOURCES.md:11-15, :28-30",
}


def tiles_root() -> Path:
    return Path(os.environ.get("ZAFRA_DATA", "")) / TILES_DIR


def read_index(root: Path, site: str) -> dict | None:
    """The site's tiles_index.json, or None when the site id is malformed or has no index."""
    if not NAME.match(site):
        return None
    try:
        return json.loads((root / site / INDEX).read_text())
    except (FileNotFoundError, NotADirectoryError):
        return None


def layer_entry(raw: dict, site: str) -> dict:
    """One index layer, normalised: product name, single date or date pair, the site's zoom
    range and bounds, the stretch and ramp, and what the colours mean."""
    kind, dates = raw["kind"], raw["dates"]
    season = kind == "change" and len(dates) > 2
    return {
        "id": raw["id"],
        "product": PRODUCTS.get(kind, kind),
        "kind": kind,
        "date": dates[0] if len(dates) == 1 else None,
        "date_pair": [dates[0], dates[-1]] if len(dates) > 1 else None,
        "season": season,
        "dates": dates,
        "label": raw.get("label"),
        "units": raw.get("units"),
        "stretch": raw.get("stretch"),
        "ramp": raw.get("ramp"),
        "nodata": raw.get("nodata"),
        "tiles": raw.get("tiles"),
        "bytes": raw.get("bytes"),
        "meaning": MEANING.get("season" if season else kind),
        "tile_url": f"/rasters/{site}/{raw['id']}/{{z}}/{{x}}/{{y}}.png",
    }


def normalise(index: dict, site: str) -> dict:
    """GET /rasters/{site}: the index's site-level fields and its layers (docs/API.md)."""
    layers = [layer_entry(raw, site) for raw in index["layers"]]
    for layer in layers:
        layer.update(minzoom=index["minzoom"], maxzoom=index["maxzoom"], bounds=index["bounds"])
    return {
        "site": site,
        "description": index.get("description"),
        "source": index.get("source"),
        "dates": index["dates"],
        "tile_size": index.get("tile_size"),
        "minzoom": index["minzoom"],
        "maxzoom": index["maxzoom"],
        "bounds": index["bounds"],
        "processing": index.get("processing"),
        "attribution": ATTRIBUTION,
        "library_index": f"{TILES_DIR}/{site}/{INDEX}",
        "layers": layers,
    }


def tile_path(root: Path, site: str, layer: str, z: int, x: int, y: int) -> Path | None:
    """Path of a tile inside `root`/<site>/<layer>, or None when the name could leave that
    directory. Callers also check that `layer` is in the site's index."""
    if not (NAME.match(site) and NAME.match(layer)) or min(z, x, y) < 0:
        return None
    base = (root / site / layer).resolve()
    path = (base / str(z) / str(x) / f"{y}.png").resolve()
    if not path.is_relative_to(base) or not base.is_relative_to(root.resolve()):
        return None
    return path
