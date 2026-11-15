"""Unit tests for tools/build_overview_tiles.py: tile arithmetic, the index <-> value round
trip, the 2 x 2 downsampling and a build over a small synthetic tile set. Needs numpy and
Pillow (the research library's environment); skipped without them."""

import importlib.util
from pathlib import Path

import pytest

np = pytest.importorskip("numpy")
Image = pytest.importorskip("PIL.Image")

TOOL = Path(__file__).resolve().parents[2] / "tools" / "build_overview_tiles.py"
spec = importlib.util.spec_from_file_location("build_overview_tiles", TOOL)
B = importlib.util.module_from_spec(spec)
spec.loader.exec_module(B)

PX = B.TILE_PX
STRETCH = (-25.0, -8.0)


def test_children_and_parent():
    assert B.children(3, 5) == [(6, 10, 0, 0), (7, 10, 1, 0), (6, 11, 0, 1), (7, 11, 1, 1)]
    assert {B.parent(cx, cy) for cx, cy, _, _ in B.children(3, 5)} == {(3, 5)}
    assert B.parent(3684, 7335) == (1842, 3667)


def test_candidates_are_missing_parents_with_a_child():
    # Morelos east edge: zoom-14 columns 3670..3684 -> zoom-13 parents 1835..1842
    have_child = {(x, 7323) for x in range(3670, 3685)}
    have = {(x, 3661) for x in range(1835, 1842)}
    assert B.candidates(have_child, have) == [(1842, 3661)]
    assert B.candidates(have_child, have | {(1842, 3661)}) == []
    assert B.candidates(set(), have) == []


def test_tile_longitudes_and_gap():
    assert B.tile_x_range_lon([0], 0) == (-180.0, 180.0)
    w, e = B.tile_x_range_lon([1842], 13)
    assert w == pytest.approx(-99.0527, abs=1e-4) and e - w == pytest.approx(360 / 2 ** 13)
    # one zoom-13 column at the equator is 360 / 8192 degrees = about 4.89 km
    assert B.gap_km([10], [10, 11], 13, 0.0) == pytest.approx(4.892, abs=1e-3)
    assert B.gap_km([10, 11], [10, 11], 13, 0.0) == 0.0
    assert B.gap_km([10], [10, 11], 13, 60.0) == pytest.approx(4.892 / 2, abs=1e-3)


def test_index_value_round_trip():
    idx = np.arange(256, dtype="uint8")
    v = B.to_values(idx, *STRETCH)
    assert np.isnan(v[0]) and v[1] == STRETCH[0] and v[255] == STRETCH[1]
    assert (B.to_index(v, *STRETCH) == idx).all()
    assert B.to_index(np.array([-99.0, 99.0, np.nan]), *STRETCH).tolist() == [1, 255, 0]


def test_downsample_ignores_nodata():
    m = np.array([[1.0, 3.0, np.nan, np.nan],
                  [np.nan, 5.0, np.nan, np.nan]])
    assert B.downsample(m).tolist()[0][0] == 3.0
    assert np.isnan(B.downsample(m)[0, 1])


def test_mosaic_places_children_by_column_and_row():
    m = B.mosaic({(1, 0): np.full((PX, PX), 2.0), (0, 1): np.full((PX, PX), 3.0)})
    assert m.shape == (2 * PX, 2 * PX)
    assert np.isnan(m[0, 0]) and m[0, PX] == 2.0 and m[PX, 0] == 3.0 and np.isnan(m[PX, PX])


def write_png(path, idx, pal):
    path.parent.mkdir(parents=True, exist_ok=True)
    img = Image.fromarray(idx.astype("uint8"), mode="P")
    img.putpalette(pal)
    img.save(path, format="PNG", transparency=0)


def test_build_layer_fills_the_missing_column_only(tmp_path):
    """Zoom 14 has columns 0..3 (row 0); the library's zoom 13 lacks column 1 and zooms 12..10
    are empty: the tool builds 13/1/0, then 12/0/0 from the library's 13/0/0 and the built
    13/1/0, then 11/0/0 and 10/0/0, and writes nothing into the library."""
    lib, out = tmp_path / "lib", tmp_path / "out"
    pal = [c for i in range(256) for c in (i, i, i)]
    for x, level in enumerate((10, 50, 100, 200)):
        write_png(lib / "14" / str(x) / "0.png", np.full((PX, PX), level), pal)
    write_png(lib / "13" / "0" / "0.png", np.full((PX, PX), 30), pal)
    before = sorted(p.relative_to(lib) for p in lib.rglob("*"))

    built = B.build_layer(lib, out, STRETCH)

    assert built == {13: [(1, 0)], 12: [(0, 0)], 11: [(0, 0)], 10: [(0, 0)]}
    assert sorted(p.relative_to(lib) for p in lib.rglob("*")) == before
    t13 = np.asarray(Image.open(out / "13" / "1" / "0.png"))  # children 14/2/0 and 14/3/0
    h = PX // 2
    assert t13.shape == (PX, PX)
    assert (t13[:h, :h] == 100).all() and (t13[:h, h:] == 200).all()
    assert (t13[h:] == 0).all()  # children 14/2/1, 14/3/1 do not exist: nodata
    assert Image.open(out / "13" / "1" / "0.png").getpalette()[:768] == pal
    t12 = np.asarray(Image.open(out / "12" / "0" / "0.png"))
    q = PX // 4
    assert (t12[:h, :h] == 30).all()  # from the library's 13/0/0
    assert (t12[:q, h:h + q] == 100).all() and (t12[:q, h + q:] == 200).all()  # the built 13/1/0
    assert (t12[q:h, h:] == 0).all() and (t12[h:] == 0).all()
    assert not (out / "13" / "0").exists()  # the library's tile is never rebuilt


def test_build_layer_keeps_built_values_unrounded(tmp_path):
    """Each 4 x 4 block of zoom-14 indices has three 2 x 2 blocks averaging 1.5 and one of 2.0.
    Zoom 13 stores 1 (1.5 rounds half to even) and 2; zoom 12 is built from the unrounded
    values, (3 * 1.5 + 2) / 4 = 1.625 -> 2, not from the PNG's (1 + 1 + 1 + 2) / 4 -> 1."""
    lib, out = tmp_path / "lib", tmp_path / "out"
    pal = [c for i in range(256) for c in (i, i, i)]
    block = np.array([[1, 2, 1, 2], [1, 2, 1, 2], [1, 2, 2, 2], [1, 2, 2, 2]])
    write_png(lib / "14" / "0" / "0.png", np.tile(block, (PX // 4, PX // 4)), pal)
    B.build_layer(lib, out, STRETCH, zooms=(13, 12))
    t13 = np.asarray(Image.open(out / "13" / "0" / "0.png"))[:PX // 2, :PX // 2]
    t12 = np.asarray(Image.open(out / "12" / "0" / "0.png"))[:PX // 4, :PX // 4]
    assert (t13 == np.tile([[1, 1], [1, 2]], (PX // 4, PX // 4))).all()
    assert (t12 == 2).all()
