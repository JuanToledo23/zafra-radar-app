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
