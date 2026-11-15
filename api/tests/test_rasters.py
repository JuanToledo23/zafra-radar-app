"""Unit tests for app.rasters (no API, no library checkout): the tile path guard and the
normalised index."""

import pytest

from app import rasters


@pytest.fixture
def root(tmp_path):
    tile = tmp_path / "tiles" / "morelos" / "hv_20251123" / "12" / "919" / "1832.png"
    tile.parent.mkdir(parents=True)
    tile.write_bytes(b"\x89PNG")
    (tmp_path / "secret.txt").write_text("outside")
    return tmp_path / "tiles"


def test_tile_path_inside_the_layer_directory(root):
    path = rasters.tile_path(root, "morelos", "hv_20251123", 12, 919, 1832)
    assert path == (root / "morelos" / "hv_20251123" / "12" / "919" / "1832.png").resolve()
    assert path.is_file()


@pytest.mark.parametrize("site, layer", [
    ("..", "secret"), ("morelos", ".."), ("morelos", "../.."), ("../morelos", "hv_20251123"),
    ("morelos", "hv_20251123/../../.."), ("/etc", "passwd"), ("morelos", ""), ("", "x"),
    ("morelos", "hv_20251123\x00"), ("Morelos", "hv_20251123"), ("morelos", "hv.20251123"),
])
def test_tile_path_rejects_names_that_could_escape(root, site, layer):
    assert rasters.tile_path(root, site, layer, 12, 919, 1832) is None


def test_tile_path_rejects_negative_coordinates(root):
    assert rasters.tile_path(root, "morelos", "hv_20251123", -1, 0, 0) is None
    assert rasters.tile_path(root, "morelos", "hv_20251123", 12, -919, 1832) is None


def test_tile_path_rejects_a_symlink_out_of_the_tile_directory(root, tmp_path):
    (root / "morelos" / "link").symlink_to(tmp_path)
    assert rasters.tile_path(root, "morelos", "link", 12, 919, 1832) is None


def test_read_index_rejects_malformed_or_missing_sites(root):
    assert rasters.read_index(root, "..") is None
    assert rasters.read_index(root, "nowhere") is None


def test_normalise_products_dates_and_meaning():
    index = {
        "dates": ["2025-11-23", "2025-12-29", "2026-01-22"], "minzoom": 10, "maxzoom": 14,
        "bounds": [0, 0, 1, 1],
        "layers": [
            {"id": "hv_20251123", "kind": "hv", "dates": ["2025-11-23"]},
            {"id": "cross_20251123", "kind": "cross", "dates": ["2025-11-23"]},
            {"id": "hv_change_20251123_20251229", "kind": "change", "dates": ["2025-11-23", "2025-12-29"]},
            {"id": "hv_change_season", "kind": "change", "dates": ["2025-11-23", "2025-12-29", "2026-01-22"]},
        ],
    }
    out = rasters.normalise(index, "morelos")
    hv, cross, pair, season = out["layers"]
    assert (hv["product"], hv["date"], hv["date_pair"], hv["season"]) == ("HV", "2025-11-23", None, False)
    assert cross["product"] == "cross-ratio"
    assert (pair["product"], pair["date"], pair["date_pair"]) == ("change", None, ["2025-11-23", "2025-12-29"])
    assert season["season"] and season["date_pair"] == ["2025-11-23", "2026-01-22"]
    assert season["meaning"] == rasters.MEANING["season"] and pair["meaning"] == rasters.MEANING["change"]
    assert all(layer["minzoom"] == 10 and layer["bounds"] == [0, 0, 1, 1] for layer in out["layers"])
    assert out["attribution"] == rasters.ATTRIBUTION


# Fallback order of the tile route (rasters.find_tile): the library's tile, then the app's
# derived overview tile, then none (the route answers 204).


@pytest.fixture
def roots(tmp_path):
    lib, derived = tmp_path / "lib", tmp_path / "derived"
    for root, z, x, y, body in [(lib, 12, 920, 1830, b"lib"), (lib, 12, 921, 1830, b"lib"),
                                (derived, 12, 921, 1830, b"derived"), (derived, 12, 921, 1831, b"derived")]:
        tile = root / "morelos" / "hv_20251123" / str(z) / str(x) / f"{y}.png"
        tile.parent.mkdir(parents=True, exist_ok=True)
        tile.write_bytes(body)
    return lib, derived


def test_find_tile_prefers_the_library(roots):
    path, i = rasters.find_tile(list(roots), "morelos", "hv_20251123", 12, 921, 1830)
    assert i == 0 and path.read_bytes() == b"lib"


def test_find_tile_falls_back_to_the_derived_tile(roots):
    path, i = rasters.find_tile(list(roots), "morelos", "hv_20251123", 12, 921, 1831)
    assert i == 1 and path.read_bytes() == b"derived"


def test_find_tile_none_when_neither_has_it(roots):
    assert rasters.find_tile(list(roots), "morelos", "hv_20251123", 12, 0, 0) == (None, None)


def test_find_tile_without_derived_directory(roots):
    lib, _ = roots
    assert rasters.find_tile([lib, None], "morelos", "hv_20251123", 12, 920, 1830)[1] == 0
    assert rasters.find_tile([lib, None], "morelos", "hv_20251123", 12, 921, 1831) == (None, None)


@pytest.mark.parametrize("site, layer", [("..", "secret"), ("morelos", "../..")])
def test_find_tile_rejects_escaping_names(roots, site, layer):
    with pytest.raises(ValueError):
        rasters.find_tile(list(roots), site, layer, 12, 921, 1831)


def test_derived_manifest_and_index_entry(roots, monkeypatch):
    _, derived = roots
    (derived / "morelos" / rasters.DERIVED_MANIFEST).write_text(
        '{"tool": "tools/build_overview_tiles.py", "library": {"commit_short": "0d6b064"},'
        ' "tiles": 2, "tiles_by_zoom": {"13": 1, "12": 1}}')
    assert rasters.read_derived(None, "morelos") is None
    assert rasters.read_derived(derived, "brazil") is None
    assert rasters.read_derived(derived, "..") is None
    entry = rasters.derived_entry(rasters.read_derived(derived, "morelos"))
    assert entry["tiles"] == 2 and entry["library_commit"] == "0d6b064" and "derived by the app" in entry["text"]
    index = {"dates": [], "minzoom": 10, "maxzoom": 14, "bounds": [0, 0, 1, 1], "layers": []}
    assert rasters.normalise(index, "morelos")["derived_tiles"] is None
    monkeypatch.setenv("ZAFRA_DERIVED", str(derived.parent))
    assert rasters.derived_root() == derived.parent / "tiles"
    monkeypatch.delenv("ZAFRA_DERIVED")
    assert rasters.derived_root() is None
