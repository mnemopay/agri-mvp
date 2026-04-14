-- Create databases for each service
CREATE DATABASE marketplace_db;
CREATE DATABASE ai_db;
CREATE DATABASE ingestion_db;
CREATE DATABASE logistics_db;
CREATE DATABASE payment_db;

-- Enable PostGIS in databases that need spatial data
\c logistics_db
CREATE EXTENSION IF NOT EXISTS postgis;

\c marketplace_db
CREATE EXTENSION IF NOT EXISTS postgis;