import os
import json
import asyncio
from datetime import datetime, timedelta, date

from fastapi import FastAPI, HTTPException
from prophet import Prophet
import pandas as pd
from redis import Redis
from dotenv import load_dotenv

from ai_db_client import upsert_price_history, upsert_weather_features, get_price_history, get_weather_features, upsert_model_metadata

load_dotenv()

app = FastAPI()

redis_conn = Redis(
    host=os.getenv('REDIS_HOST', 'redis'),
    port=int(os.getenv('REDIS_PORT', 6379)),
    decode_responses=True
)

MODEL_DIR = os.getenv('MODEL_DIR', '/models')

def model_file_path(crop_type: str, region: str) -> str:
    safe_crop = crop_type.replace('/', '_').replace(' ', '_').lower()
    safe_region = region.replace('/', '_').replace(' ', '_').lower()
    return os.path.join(MODEL_DIR, f"{safe_crop}__{safe_region}.json")

def _ensure_models_dir():
    os.makedirs(MODEL_DIR, exist_ok=True)

def generate_prophet_forecast_with_intervals(
    crop_type: str,
    region: str,
    historical_prices: list,
    weather_rows: list,
    forecast_days_list=(7, 30)
):
    """
    historical_prices: [{date:'YYYY-MM-DD', price:float}]
    weather_rows: [{forecast_time:'ISO', features:{temp_avg,...}}] (may be sparse)
    """
    if len(historical_prices) < 20:
        raise ValueError("Not enough historical price data to train Prophet (need >= 20 points).")

    # Build base dataframe
    df = pd.DataFrame([{'ds': pd.to_datetime(p['date']), 'y': float(p['price'])} for p in historical_prices])
    df['ds'] = pd.to_datetime(df['ds']).dt.tz_localize(None)

    # Add weather features by date (aggregate/simplify to daily)
    # Map weather forecast_time -> date
    weather_by_date = {}
    for wr in weather_rows or []:
        t = pd.to_datetime(wr['forecast_time']).tz_localize(None)
        d = t.date().isoformat()
        feats = wr.get('features', {})
        if d not in weather_by_date:
            weather_by_date[d] = {'count': 0}
            for k in feats.keys():
                weather_by_date[d][k] = 0.0 if feats.get(k) is not None else None
        if weather_by_date[d]['count'] == 0:
            # initialize sums to 0 where numeric
            for k in feats.keys():
                if feats.get(k) is None:
                    continue
                weather_by_date[d][k] = float(feats.get(k))
        else:
            for k in feats.keys():
                if feats.get(k) is None or weather_by_date[d].get(k) is None:
                    continue
                # sum
                weather_by_date[d][k] = float(weather_by_date[d][k]) + float(feats.get(k))

        weather_by_date[d]['count'] += 1

    # final averages
    daily_weather = {}
    for d, agg in weather_by_date.items():
        cnt = max(1, agg.get('count', 1))
        daily_weather[d] = {}
        for k, v in agg.items():
            if k == 'count':
                continue
            if v is None:
                daily_weather[d][k] = None
            else:
                daily_weather[d][k] = float(v) / cnt

    weather_feature_cols = ['temp_avg', 'humidity_avg', 'wind_speed_avg', 'rain_prob', 'cloud_cover_avg']
    for c in weather_feature_cols:
        df[c] = df['ds'].dt.date.astype(str).map(lambda d: daily_weather.get(d, {}).get(c))

    # Prophet with regressors
    m = Prophet(daily_seasonality=True)
    for c in weather_feature_cols:
        # Prophet requires numeric; fill missing with median
        if c in df.columns:
            median_val = pd.to_numeric(df[c], errors='coerce').median()
            df[c] = pd.to_numeric(df[c], errors='coerce').fillna(median_val)
            m.add_regressor(c)

    m.fit(df)

    future = m.make_future_dataframe(periods=max(forecast_days_list))
    future['ds'] = pd.to_datetime(future['ds']).dt.tz_localize(None)

    # For future regressors, use last known weather day median as a baseline
    # (If you store forecast features, you can use them instead; for MVP we use last observed)
    last_known = df.iloc[-1]
    for c in weather_feature_cols:
        future[c] = last_known[c]

    forecast = m.predict(future)

    result = {}
    for days in forecast_days_list:
        target_date = (df['ds'].max().date() + timedelta(days=days))
        row = forecast[forecast['ds'].dt.date == target_date]
        if row.empty:
            # fallback by index
            idx = len(df) + (days - 1)
            row = forecast.iloc[[idx]]
        row = row.iloc[0]
        result[str(days)] = {
            'yhat': float(row['yhat']),
            'yhat_lower': float(row['yhat_lower']),
            'yhat_upper': float(row['yhat_upper'])
        }

    return result

async def process_streams():
    # Consume:
    # - data.updated (USDA price history)
    # - weather.updated (weather features)
    for stream in ['data.updated', 'weather.updated']:
        try:
            redis_conn.xgroup_create(stream, 'ai-group', id='0', mkstream=True)
        except Exception:
            pass

    while True:
        try:
            # read both streams in one loop
            for stream in ['data.updated', 'weather.updated']:
                results = redis_conn.xreadgroup(
                    'ai-group', 'ai-consumer-1',
                    {stream: '>'},
                    count=10, block=1000
                )
                if not results:
                    continue

                for stream_name, messages in results:
                    for msg_id, data in messages:
                        payload = json.loads(data['data'])
                        if stream_name == 'data.updated':
                            # payload: { type:'PRICES', records:[{crop_type,region,date,price}] } or { data.updated:... }
                            records = payload.get('records') or payload.get('payload') or []
                            # accept alternative shapes
                            if records and 'crop_type' not in records[0]:
                                # from older mock format
                                records = [
                                    {
                                        'crop_type': r.get('crop_type') or r.get('crop') or 'unknown',
                                        'region': r.get('region') or 'Dallas,TX',
                                        'date': (datetime.utcnow().date().isoformat()),
                                        'price': r.get('price')
                                    } for r in records
                                ]
                            upsert_price_history(records)
                        elif stream_name == 'weather.updated':
                            records = payload.get('records') or payload.get('payload') or []
                            if records and 'region' not in records[0]:
                                # fallback/mock
                                records = [
                                    {
                                        'region': 'Dallas,TX',
                                        'latitude': payload.get('latitude', 32.7767),
                                        'longitude': payload.get('longitude', -96.7970),
                                        'forecast_time': datetime.utcnow().isoformat(),
                                        'features': payload.get('features', payload.get('payload', {}))
                                    }
                                ]
                            upsert_weather_features(records)

                        redis_conn.xack(stream_name, 'ai-group', msg_id)
        except Exception as e:
            print(f"AI stream consumer error: {e}")
        await asyncio.sleep(0.1)

@app.get("/health")
def health():
    return {"status": "ok", "service": "ai-service"}

@app.post("/retrain")
def retrain(body: dict):
    """
    Expected body:
    {
      crop_type, region,
      historical_prices:[{date,price}],
      weather_data:[{forecast_time,features:{...}}] (optional),
      latitude, longitude (optional for future use)
    }
    """
    crop_type = body.get('crop_type')
    region = body.get('region')
    if not crop_type or not region:
        raise HTTPException(status_code=400, detail="crop_type and region are required")

    historical_prices = body.get('historical_prices') or []
    weather_data = body.get('weather_data') or []

    if not historical_prices:
        # allow retrain from stored history
        # (use last 180 days)
        hist = get_price_history(crop_type, region, limit=500)
        historical_prices = [{'date': h['date'], 'price': h['price']} for h in hist]

    if not historical_prices:
        raise HTTPException(status_code=400, detail="No historical_prices provided or found in DB")

    # Persist model input price history into DB (optional but helpful)
    try:
        upsert_price_history([
            {'crop_type': crop_type, 'region': region, 'date': hp['date'], 'price': hp['price']}
            for hp in historical_prices
        ])
    except Exception:
        pass

    _ensure_models_dir()
    forecast_days = (7, 30)

    weather_rows = weather_data
    # Train on stored + provided weather
    try:
        result = generate_prophet_forecast_with_intervals(
            crop_type=crop_type,
            region=region,
            historical_prices=historical_prices,
            weather_rows=weather_rows,
            forecast_days_list=forecast_days
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    model_path = model_file_path(crop_type, region)

    # Prophet doesn't have an official portable JSON save for custom regressors across environments for MVP;
    # We'll save a minimal JSON snapshot of forecasts + params.
    # (You can later replace with pystan/prophet serialization if needed.)
    model_artifact = {
        'crop_type': crop_type,
        'region': region,
        'trained_at': datetime.utcnow().isoformat(),
        'historical_points': len(historical_prices),
        'model_path': model_path,
        'latest_forecast': result
    }
    with open(model_path, 'w') as f:
        json.dump(model_artifact, f)

    upsert_model_metadata(
        crop_type=crop_type,
        region=region,
        model_path=model_path,
        history_points=len(historical_prices)
    )

    return {
        'message': 'Model retrained',
        'model_path': model_path,
        'forecast': result
    }

@app.get("/recommend")
def recommend(crop_type: str, region: str, quantity: float = 1.0, latitude: float = None, longitude: float = None):
    """
    Expected query:
      /recommend?crop_type=tomatoes&region=Dallas,TX&quantity=10&latitude=32.7767&longitude=-96.797
    Uses stored historical price history + stored weather_features near region/coords when provided.
    """
    if not crop_type or not region:
        raise HTTPException(status_code=400, detail="crop_type and region are required")

    hist = get_price_history(crop_type, region, limit=365)
    historical_prices = [{'date': h['date'], 'price': h['price']} for h in hist]

    if not historical_prices:
        raise HTTPException(status_code=400, detail="No price history available in DB for that crop_type+region")

    # Weather: if coords provided, filter; else use whatever is present for region (by selecting any coord via DB is more complex)
    weather_rows = []
    if latitude is not None and longitude is not None:
        start_dt = (datetime.utcnow() - timedelta(days=365)).isoformat()
        end_dt = datetime.utcnow().isoformat()
        weather = get_weather_features(region, float(latitude), float(longitude), start_dt, end_dt)
        weather_rows = weather

    # If no weather rows, train with last known weather regressors fallback inside generator
    _ = len(weather_rows)

    # Train/predict (for MVP: fit fresh each request; you can cache models)
    forecast = generate_prophet_forecast_with_intervals(
        crop_type=crop_type,
        region=region,
        historical_prices=historical_prices,
        weather_rows=weather_rows,
        forecast_days_list=(7, 30)
    )

    # Suggested price: use 7-day yhat as recommendation
    suggested_price = forecast['7']['yhat']

    # Confidence score: derive from interval width heuristic
    lower = forecast['7']['yhat_lower']
    upper = forecast['7']['yhat_upper']
    interval = max(1e-9, upper - lower)
    confidence = float(max(0.0, min(1.0, 1.0 - (interval / max(1.0, suggested_price)))))

    # Return price forecasts with intervals
    return {
        "crop_type": crop_type,
        "region": region,
        "quantity": float(quantity),
        "suggested_price": float(suggested_price),
        "confidence_score": confidence,
        "forecast": {
            "7_day": forecast['7'],
            "30_day": forecast['30']
        }
    }

@app.on_event("startup")
async def startup_event():
    _ensure_models_dir()
    asyncio.create_task(process_streams())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
