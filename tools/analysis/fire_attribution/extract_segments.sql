-- E3. Cane segments as loaded (harvest date and the first season fire within 200 m, for a check).
-- Adapted from the investigation, which read segments.first_fire_date: the loader no longer
-- writes that column, so its definition (season fires within 200 m on the geography, local date)
-- is computed here from `fires`.
\copy (SELECT g.segment_id, g.harvest_date, (SELECT min(f.datetime_local::date) FROM fires f JOIN sites t ON t.site_id = f.site_id WHERE f.site_id = g.site_id AND f.datetime_utc >= t.season_start::timestamp AT TIME ZONE 'UTC' AND f.datetime_utc < t.season_end::timestamp AT TIME ZONE 'UTC' AND f.geom && ST_Expand(g.geom, 0.01) AND ST_DWithin(f.geom::geography, g.geom::geography, 200)) AS first_fire_date FROM segments g WHERE g.site_id = 'morelos' ORDER BY g.segment_id) TO STDOUT WITH CSV HEADER
