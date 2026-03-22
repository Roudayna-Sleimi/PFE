import os
from datetime import datetime, timezone
import pandas as pd
from pymongo import MongoClient
from dotenv import load_dotenv
load_dotenv()
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:m/cncpulse")
DB_NAME = os.getenv("MONGO_DB_NAME", "cncpulse")
OUTPUT_PATH = os.getenv("OUTPUT_DATASET_PATH", "python-ai/data/lstm_dataset.csv")
def auto_label(courant, vib_x, vib_y, vib_z):
  if courant > 20 or max(vib_x, vib_y, vib_z) > 3:
    return "critical"
  if courant > 15 or max(vib_x, vib_y, vib_z) > 2:
    return "warning"
  return "normal"
def main():
  client = MongoClient(MONGO_URI)
  db = client[DB_NAME]
  sensors = list(db.sensordatas.find({}, {"_id": 0}))
  if not sensors:
    raise RuntimeError("No sensor data found in MongoDB.")
  rows = []
  for item in sensors:
    ts = item.get("createdAt")
    if isinstance(ts, datetime):
      ts = ts.astimezone(timezone.utc).isoformat()
    else:
      ts = datetime.now(timezone.utc).isoformat()
    vib_x = float(item.get("vibX", 0.0))
    vib_y = float(item.get("vibY", 0.0))
    vib_z = float(item.get("vibZ", 0.0))
    courant = float(item.get("courant", 0.0))
    rpm = float(item.get("rpm", 0.0))
    machine_id = item.get("machineId") or item.get("node") or "UNKNOWN"
    rows.append({
      "timestamp": ts,
      "machine_id": machine_id,
      "vibX": vib_x,
      "vibY": vib_y,
      "vibZ": vib_z,
      "courant": courant,
      "rpm": rpm,
      "label": auto_label(courant, vib_x, vib_y, vib_z)
    })
  df = pd.DataFrame(rows)
  os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
  df.to_csv(OUTPUT_PATH, index=False)
  print(f"Dataset saved: {OUTPUT_PATH} ({len(df)} rows)")
if __name__ == "__main__":
  main()