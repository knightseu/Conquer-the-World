-- Up Migration
-- PostGIS for Track geometry and Land tiles (ST_AsMVT, ADR 0005).
CREATE EXTENSION IF NOT EXISTS postgis;

-- Down Migration
DROP EXTENSION IF EXISTS postgis;
