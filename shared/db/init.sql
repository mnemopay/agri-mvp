-- Create extension if needed (logistics)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create databases for each service
CREATE DATABASE marketplace_db;
CREATE DATABASE ai_db;
CREATE DATABASE ingestion_db;
CREATE DATABASE logistics_db;
CREATE DATABASE payment_db;

-- Grant permissions if necessary (simplifying for MVP)
