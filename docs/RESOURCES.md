# Resources

Data, resources and software behind this application. The data were downloaded and
processed in the research library (zafra-radar-research) before the event; this application
reads its result files (see [DATA.md](../DATA.md)). Descriptions, credit lines and URLs are
copied from the library's `docs/DATA_SOURCES.md` and `docs/REFERENCES.md`; an entry without a
URL is one those documents do not give.

## NASA data

- **NISAR L2 GCOV** (L-band backscatter, HH and HV), PROVISIONAL
  (`NISAR_L2_GCOV_PROVISIONAL_V1`). NASA/JPL-ISRO NISAR Project, distributed by ASF DAAC.
  Accessed with NASA Earthdata Login through ASF (`asf_search`). Product specification:
  https://cumulus.asf.earthdatacloud.nasa.gov/PUBLIC/DATA/NISAR/NISAR_D-102274_RevF_NASA_SDS_Product_Specification_L2_GCOV_w-esigs.pdf.
  ASF NISAR documentation: https://nisar-docs.asf.alaska.edu/. NASA open data.
- **NISAR L2 GUNW** (interferometric coherence magnitude only), PROVISIONAL
  (`NISAR_L2_GUNW_PROVISIONAL_V1`). NASA/JPL-ISRO NISAR Project, ASF DAAC. Same access and
  terms as GCOV.
- **NASA FIRMS VIIRS active fires** (375 m, Suomi-NPP, NOAA-20, NOAA-21).
  https://earthdata.nasa.gov/firms; area API https://firms.modaps.eosdis.nasa.gov/api/area/.
  Credit: "We acknowledge the use of data and imagery from NASA's Fire Information for
  Resource Management System (FIRMS) (https://earthdata.nasa.gov/firms), part of NASA's
  Earth Science Data and Information System (ESDIS)."
- **NASA GPM IMERG** Final, half-hourly, V07 (`NASA/GPM_L3/IMERG_V07`), NASA GES DISC.
  https://gpm.nasa.gov/data/imerg;
  https://developers.google.com/earth-engine/datasets/catalog/NASA_GPM_L3_IMERG_V07.
  Cite Huffman, G. J. et al., GPM IMERG Final Precipitation L3 Half Hourly 0.1° × 0.1° V07,
  GES DISC.

## Challenge resources used

- NASA Earthdata Login: https://urs.earthdata.nasa.gov
- ASF Vertex / `asf_search`
- NISAR Data User Guide
- ARSET NISAR training

## Space agency partner and other data

- **ESA Copernicus Sentinel-1 GRD** (`COPERNICUS/S1_GRD`), via Google Earth Engine.
  https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S1_GRD.
  Credit: "Contains modified Copernicus Sentinel data [year]".
- **ESA Copernicus Sentinel-2 L2A** (`COPERNICUS/S2_SR_HARMONIZED`), via Google Earth Engine.
  https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED.
  Credit: "Contains modified Copernicus Sentinel data [year]".
- **Google Earth Engine**: Gorelick, N. et al. (2017). doi:10.1016/j.rse.2017.06.031,
  https://doi.org/10.1016/j.rse.2017.06.031.
- **ESA WorldCover 2021** v200 (`ESA/WorldCover/v200`). CC BY 4.0. Zanaga, D. et al.
  (2022), doi:10.5281/zenodo.7254221, https://doi.org/10.5281/zenodo.7254221.
- **MapBiomas Brazil, Collection 10** (class 20, sugar cane). CC BY 4.0.
  https://brasil.mapbiomas.org.
- **CONADESUCA, zafra 2025/26**: weekly progress reports 1-36 (*Reporte de avance de
  producción de caña y azúcar*; https://www.gob.mx/conadesuca, individual file URLs not
  recorded) and the final report (*Reporte final de producción de caña y azúcar*, published
  17 Aug 2026):
  https://www.gob.mx/cms/uploads/attachment/file/1098473/Reporte_de_cifras_finales_25_26.pdf.
- **Esri World Imagery** basemap (online mode of the map).
  https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer.

## Own prior work

- **zafra-radar-research**, by the author, published before the event:
  https://github.com/JuanToledo23/zafra-radar-research. Code MIT; author-made data and
  committed results CC BY 4.0. Third-party data keep their upstream terms (above).
  This repository's initial scaffold was copied from its `product/` directory as of
  `v0.1.0` (commit `40edf63`, tagged 2026-11-11). The library received one commit during
  the event, `0d6b064` (2026-11-14), which adds the comparison of detected harvest with
  official CONADESUCA mill reports (analysis only; it does not touch `product/`). The copy
  was taken from a checkout at `0d6b064`, where `product/` is byte-identical to `v0.1.0`.

## Third-party software

Versions from the manifests in this repository. Licenses from the installed package
metadata (pip metadata in the api image; `package.json` of the installed npm packages);
blank where the metadata does not state one.

| Package | Version | Source | License |
|---|---|---|---|
| fastapi | 0.115.12 | `api/requirements.txt` | MIT |
| uvicorn[standard] | 0.34.2 | `api/requirements.txt` | BSD-3-Clause |
| sqlalchemy[asyncio] | 2.0.40 | `api/requirements.txt` | MIT |
| asyncpg | 0.30.0 | `api/requirements.txt` | Apache License, Version 2.0 |
| pyarrow | 26.0.0 | `api/requirements.txt` | Apache-2.0 |
| PyYAML | 6.0.3 | installed with `uvicorn[standard]` (not pinned) | MIT |
| maplibre-gl | 5.24.0 | `web/package.json` | BSD-3-Clause |
| react | 19.3.1 | `web/package.json` | MIT |
| react-dom | 19.3.1 | `web/package.json` | MIT |
| @types/geojson | 7946.0.16 | `web/package.json` (dev) | MIT |
| @types/node | 24.19.2 | `web/package.json` (dev) | MIT |
| @types/react | 19.3.0 | `web/package.json` (dev) | MIT |
| @types/react-dom | 19.3.0 | `web/package.json` (dev) | MIT |
| @vitejs/plugin-react | 5.2.0 | `web/package.json` (dev) | MIT |
| typescript | 5.9.3 | `web/package.json` (dev) | Apache-2.0 |
| vite | 7.3.7 | `web/package.json` (dev) | MIT |
| playwright | 1.64.1 | `scripts/package.json` (dev, screenshot script) | Apache-2.0 |
| postgis/postgis (PostGIS 3.4.3, PostgreSQL 16) | 16-3.4 | `docker-compose.yml` | |
| python | 3.12-slim | `api/Dockerfile` | |
| node | 24-alpine | `web/Dockerfile`, `docker-compose.offline.yml` | |

## Space Apps Global Offers used

- Domain registration
- Google Cloud

---

This project is not affiliated with or endorsed by NASA. No NASA logos or insignia are used.
