import os
import json
import uuid
from datetime import date, datetime

import psycopg2
from psycopg2.extras import execute_values

def _get_conn():
    return psycopg2.connect(
        host=os.getenv('DB_HOST', 'postgres'),
        port=int(os.getenv('DB_PORT', '5432')),
        user=os.getenv('DB_USER', 'admin'),
        password=os.getenv('DB_PASSWORD', 'password'),
        database=os.getenv('AI_DB', 'ai_db'),
    )

def ensure_tables_exist():
    # migrations handle this in production; keep placeholder
    pass

def upsert_price_history(records):
    """
    records: list of {crop_type, region, date (YYYY-MM-DD), price (float)}
    """
    if not records:
        return

    rows = []
    for r in records:
        rows.append((
            str(uuid.uuid4()),
            r['crop_type'],
            r['region'],
            r['date'],
            float(r['price']),
            r.get('source', 'USDA_AMS')
        ))

    sql = """
    INSERT INTO price_history (id, crop_type, region, date, price, source, created_at, updated_at)
    VALUES %s
    ON CONFLICT (crop_type, region, date)
    DO UPDATE SET
      price = EXCLUDED.price,
      source = EXCLUDED.source,
      updated_at = NOW();
    """
    conn = _get_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                execute_values(cur, sql, rows, template=None, fetch=False)
    finally:
        conn.close()

def upsert_weather_features(records):
    """
    records: list of:
    {
      region, latitude, longitude, forecast_time (ISO string), features: {temp_avg,temp_min,temp_max, humidity_avg, wind_speed_avg, rain_prob, cloud_cover_avg}
    }
    """
    if not records:
        return

    rows = []
    for r in records:
        f = r.get('features', {})
        rows.append((
            str(uuid.uuid4()),
            r['region'],
            float(r['latitude']),
            float(r['longitude']),
            r['forecast_time'],  # ISO
            f.get('temp_avg'),
            f.get('temp_min'),
            f.get('temp_max'),
            f.get('humidity_avg'),
            f.get('wind_speed_avg'),
            f.get('rain_prob'),
            f.get('cloud_cover_avg'),
            r.get('source', 'OPENWEATHER_FORECAST')
        ))

    sql = """
    INSERT INTO weather_features (
      id, region, latitude, longitude, forecast_time,
      temp_avg, temp_min, temp_max, humidity_avg, wind_speed_avg, rain_prob, cloud_cover_avg,
      source, created_at, updated_at
    )
    VALUES %s
    ON CONFLICT (region, latitude, longitude, forecast_time)
    DO UPDATE SET
      temp_avg = EXCLUDED.temp_avg,
      temp_min = EXCLUDED.temp_min,
      temp_max = EXCLUDED.temp_max,
      humidity_avg = EXCLUDED.humidity_avg,
      wind_speed_avg = EXCLUDED.wind_speed_avg,
      rain_prob = EXCLUDED.rain_prob,
      cloud_cover_avg = EXCLUDED.cloud_cover_avg,
      source = EXCLUDED.source,
      updated_at = NOW();
    """
    conn = _get_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                execute_values(cur, sql, rows, template=None, fetch=False)
    finally:
        conn.close()

def get_price_history(crop_type, region, since_date=None, limit=500):
    conn = _get_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                if since_date:
                    cur.execute("""
                      SELECT date, price
                      FROM price_history
                      WHERE crop_type=%s AND region=%s AND date >= %s
                      ORDER BY date ASC
                      LIMIT %s
                    """, (crop_type, region, since_date, limit))
                else:
                    cur.execute("""
                      SELECT date, price
                      FROM price_history
                      WHERE crop_type=%s AND region=%s
                      ORDER BY date ASC
                      LIMIT %s
                    """, (crop_type, region, limit))
                rows = cur.fetchall()
                return [{'date': r[0].isoformat(), 'price': float(r[1])} for r in rows]
    finally:
        conn.close()

def get_weather_features(region, latitude, longitude, start_dt, end_dt):
    conn = _get_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                  SELECT forecast_time,
                         temp_avg, temp_min, temp_max,
                         humidity_avg, wind_speed_avg, rain_prob, cloud_cover_avg
                  FROM weather_features
                  WHERE region=%s
                    AND latitude=%s AND longitude=%s
                    AND forecast_time >= %s AND forecast_time <= %s
                  ORDER BY forecast_time ASC
                """, (region, latitude, longitude, start_dt, end_dt))
                rows = cur.fetchall()
                out = []
                for r in rows:
                    out.append({
                        'forecast_time': r[0].isoformat(),
                        'features': {
                            'temp_avg': r[1],
                            'temp_min': r[2],
                            'temp_max': r[3],
                            'humidity_avg': r[4],
                            'wind_speed_avg': r[5],
                            'rain_prob': r[6],
                            'cloud_cover_avg': r[7]
                        }
                    })
                return out
    finally:
        conn.close()

def upsert_model_metadata(crop_type, region, model_path, history_points):
    conn = _get_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                  INSERT INTO model_metadata (id, crop_type, region, model_path, trained_at, history_points, status, created_at, updated_at)
                  VALUES (%s,%s,%s,%s,NOW(),%s,'TRAINED',NOW(),NOW())
                  ON CONFLICT (crop_type, region)
                  DO UPDATE SET
                    model_path = EXCLUDED.model_path,
                    trained_at = EXCLUDED.trained_at,
                    history_points = EXCLUDED.history_points,
                    status = 'TRAINED',
                    updated_at = NOW();
                """, (str(uuid.uuid4()), crop_type, region, model_path, int(history_points)))
    finally:
        conn.close()
