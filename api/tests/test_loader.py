"""Unit tests for the pure parsing functions of app.loader (no database, no files)."""

import datetime as dt
import json

import pytest

from app import loader as L

PROPS = {
    "segment_id": "cc00042", "area_ha": 1.33, "p_cane": 0.972, "p_cane_radar": 0.802,
    "p_cane_optical": 0.972, "harvest_date": "2026-01-07T00:00:00",
    "date_uncertainty_days": 2.5, "status": "harvested", "confidence": "high",
    "hv_drop_db": -3.8, "coh_min": 0.2, "wc_disagrees": False,
}

CFG = {
    "name": "morelos",
    "description": "Ingenio Emiliano Zapata supply area",
    "aoi": {"bbox": [-99.35, 18.50, -99.05, 18.75]},
    "zafra": {"name": "2025-26"},
    "alerts": {"timezone": "America/Mexico_City"},
    "firms": {"dir": "data/firms"},
    "paths": {"slim_geojson": "data/results/m.geojson", "timeseries": "data/features/t.parquet",
              "coherence": "data/features/c.parquet", "results_dir": "results/4e"},
}


def test_segment_record_maps_every_column_in_order():
    rec = L.segment_record(PROPS)
    assert len(rec) == len(L.SEGMENT_COLUMNS)
    row = dict(zip(L.SEGMENT_COLUMNS, rec))
    assert row["harvest_date"] == dt.date(2026, 1, 7)
    assert row["wc_disagrees"] is False
    assert row["p_cane_optical"] == pytest.approx(0.972)


def test_segment_record_null_date_and_nan():
    row = dict(zip(L.SEGMENT_COLUMNS, L.segment_record(
        {**PROPS, "harvest_date": None, "hv_drop_db": float("nan")})))
    assert row["harvest_date"] is None
    assert row["hv_drop_db"] is None


def test_segment_record_rejects_unmapped_property():
    with pytest.raises(ValueError, match="cane_confidence"):
        L.segment_record({**PROPS, "cane_confidence": "high"})


def test_site_info_and_paths():
    info = L.site_info(CFG)
    assert info == {"site_id": "morelos", "name": "Ingenio Emiliano Zapata supply area",
                    "season": "2025-26", "bbox": (-99.35, 18.50, -99.05, 18.75),
                    "timezone": "America/Mexico_City"}
    p = L.site_paths(CFG)
    assert p["weekly"] == "results/4e/weekly.csv"
    assert p["summaries"] == "results/6/summaries.jsonl"
    assert L.site_paths({**CFG, "name": "brazil"})["summaries"] == "results/6_brazil/summaries.jsonl"


def test_weekly_record_reads_week_column():
    row = {"week": "2025-11-03", "harvests": "0", "harvest_ha": "0.0", "fires_all": "6",
           "fires_cane": "5", "harvests_no_baseline_rule": "0"}
    assert L.weekly_record(row) == (dt.date(2025, 11, 3), 0, 6, 5)
    with pytest.raises(ValueError, match="week"):
        L.weekly_record({k: v for k, v in row.items() if k != "week"})


def test_official_record_blank_cells_are_null():
    row = {"cutoff": "2025-11-15", "week_start": "2025-11-09", "report": "1", "cycle_week": "7",
           "cum_ha": "0.0", "cum_cane_t": "0.0", "reported_week_ha": "",
           "reported_week_cane_t": "", "week_ha": "12.5", "week_cane_t": "0.0",
           "diff_vs_reported_ha": "", "diff_vs_reported_cane_t": ""}
    out = dict(zip(L.OFFICIAL_COLUMNS, L.official_record(row)))
    assert out["cutoff"] == dt.date(2025, 11, 15)
    assert out["report"] == 1
    assert out["reported_week_ha"] is None
    assert out["week_ha"] == 12.5


def test_firms_times_utc_to_local():
    utc, local = L.firms_times("2024-11-11", "2026", "America/Mexico_City")
    assert utc == dt.datetime(2024, 11, 11, 20, 26, tzinfo=dt.timezone.utc)
    assert local == dt.datetime(2024, 11, 11, 14, 26)
    # leading zeros dropped in the CSV: 130 = 01:30 UTC, the previous evening in Mexico
    _, local = L.firms_times("2026-02-01", "130", "America/Mexico_City")
    assert local == dt.datetime(2026, 1, 31, 19, 30)
    _, local = L.firms_times("2026-07-01", "1200", "America/Sao_Paulo")
    assert local == dt.datetime(2026, 7, 1, 9, 0)


def test_firms_record():
    row = {"latitude": "18.74424", "longitude": "-99.34781", "acq_date": "2024-11-11",
           "acq_time": "2026", "satellite": "N", "confidence": "n", "frp": "2.92",
           "source": "VIIRS_SNPP_SP"}
    lon, lat, _, local, sat, src, frp, conf = L.firms_record(row, "America/Mexico_City")
    assert (lon, lat, sat, src, frp, conf) == (-99.34781, 18.74424, "N", "VIIRS_SNPP_SP", 2.92, "n")
    assert local.hour == 14


def _record(segment_id="cc23748", llm_renderer="llm", llm_ok=True):
    ok = {"ok": True, "problems": []}
    return {
        "label": f"segment {segment_id}", "key": segment_id, "tags": [],
        "facts": {"segment_id": segment_id, "field_id": None},
        "alerts": [{"code": "FIRE_ACTIVE_OUTSIDE_HOURS", "severity": "warning",
                    "message_es": "x", "message_en": "x",
                    "evidence": {"frp": 3.1, "gap": float("nan")}}],
        "template": {"es": "t es", "en": "t en", "verifier": {"es": ok, "en": ok}},
        "llm": {"renderer": llm_renderer, "rejected": None, "es": "l es", "en": "l en",
                "verifier": {"es": ok, "en": {"ok": llm_ok, "problems": []}}},
    }


def test_summary_rows_template_and_verified_llm():
    rows = L.summary_rows(_record())
    assert ("cc23748", "es", "template", "t es") in rows
    assert ("cc23748", "en", "llm", "l en") in rows
    assert len(rows) == 4


def test_summary_rows_skip_llm_fallback_and_failed_verifier():
    assert {r[2] for r in L.summary_rows(_record(llm_renderer="template"))} == {"template"}
    rows = L.summary_rows(_record(llm_ok=False))
    assert ("cc23748", "en", "llm", "l en") not in rows
    assert ("cc23748", "es", "llm", "l es") in rows


def test_reference_field_records_are_skipped():
    rec = _record()
    rec["facts"] = {"segment_id": None, "field_id": "p36"}
    assert L.record_segment_id(rec) is None
    assert L.summary_rows(rec) == []
    assert L.alert_rows(rec) == []


def test_alert_rows_evidence_is_valid_json():
    [(sid, code, sev, evidence)] = L.alert_rows(_record())
    assert (sid, code, sev) == ("cc23748", "FIRE_ACTIVE_OUTSIDE_HOURS", "warning")
    assert json.loads(evidence) == {"frp": 3.1, "gap": None}


def test_format_counts():
    text = L.format_counts({("segments", "morelos"): 6014}, ("morelos", "brazil"))
    seg = next(line for line in text.splitlines() if line.startswith("segments "))
    assert seg.split() == ["segments", "6,014", "0"]
