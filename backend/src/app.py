import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query, HTTPException, Depends
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import jwt
import bcrypt
import os
import random
import uuid
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv

load_dotenv()

from src.database import (
    init_db, get_kpis, get_job_runs, get_duration_history,
    upsert_job_run, upsert_job, JobRunSchema, JobSchema,
    create_user, get_user, update_user_config, get_user_config, get_users_without_config
)
from src.collectors.databricks import DatabricksCollector

JWT_SECRET = os.environ.get("JWT_SECRET", "super-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

security = HTTPBearer()

class UserAuthSchema(BaseModel):
    username: str
    password: str

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))

def create_jwt_token(username: str) -> str:
    payload = {
        "sub": username,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        username = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token: missing subject")
        
        # Verify user exists in the database
        if not get_user(username):
            raise HTTPException(status_code=401, detail="User session not found in database. Please register/login again.")
            
        return username
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Helper to construct DatabricksCollector dynamically per user
def get_user_collector(username: str) -> Optional[DatabricksCollector]:
    cfg = get_user_config(username)
    if cfg and cfg.get("databricks_host") and cfg.get("databricks_token"):
        return DatabricksCollector(host=cfg["databricks_host"], token=cfg["databricks_token"])
    return None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Init database
    init_db()
    yield

app = FastAPI(
    title="Pipeline Monitor API",
    description="Backend service for tracking data warehouse and ingestion pipeline runs telemetry",
    lifespan=lifespan
)

# Web endpoints
@app.get("/", response_class=HTMLResponse)
@app.get("/dashboard", response_class=HTMLResponse)
async def get_dashboard():
    template_path = os.path.join(os.path.dirname(__file__), "templates", "index.html")
    if not os.path.exists(template_path):
        raise HTTPException(status_code=404, detail="Dashboard UI template not found")
        
    with open(template_path, "r", encoding="utf-8") as f:
        html_content = f.read()
    return html_content

# Authentication endpoints
@app.post("/api/auth/register")
async def register_user(payload: UserAuthSchema):
    if not payload.username or not payload.password:
        raise HTTPException(status_code=400, detail="Username and password are required")
    
    existing = get_user(payload.username)
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    hashed = hash_password(payload.password)
    try:
        create_user(payload.username, hashed)
        return {"status": "success", "message": "User registered successfully"}
    except Exception as e:
        logger.error(f"Error registering user: {e}")
        raise HTTPException(status_code=500, detail="Registration failed")

@app.post("/api/auth/login")
async def login_user(payload: UserAuthSchema):
    user = get_user(payload.username)
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    token = create_jwt_token(payload.username)
    return {"token": token, "username": payload.username}

# REST API endpoints
@app.get("/api/kpis")
async def get_metrics(username: str = Depends(get_current_user)):
    """Returns aggregated KPI summary metrics."""
    try:
        return get_kpis(username)
    except Exception as e:
        logger.error(f"Error computing KPIs: {e}")
        raise HTTPException(status_code=500, detail="Database fetch failed")

@app.get("/api/runs")
async def get_runs(limit: int = 50, status: Optional[str] = None, job_id: Optional[str] = None, username: str = Depends(get_current_user)):
    """Returns list of job runs filtered by status and/or job_id."""
    try:
        return get_job_runs(limit=limit, status=status, job_id=job_id, username=username)
    except Exception as e:
        logger.error(f"Error fetching runs: {e}")
        raise HTTPException(status_code=500, detail="Database fetch failed")

@app.get("/api/duration-history")
async def get_durations(limit: int = 20, username: str = Depends(get_current_user)):
    """Returns run duration series data for plotting charts."""
    try:
        return get_duration_history(limit=limit, username=username)
    except Exception as e:
        logger.error(f"Error fetching durations: {e}")
        raise HTTPException(status_code=500, detail="Database fetch failed")

@app.get("/api/anomalies")
async def get_anomalies(username: str = Depends(get_current_user)):
    """Detects and returns pipeline runs that are weirdly long compared to their average durations."""
    try:
        from src.database import get_db_connection
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # Query average duration per job from successful runs
            cursor.execute("""
                SELECT job_id, job_name, AVG(duration) as avg_duration, COUNT(*) as run_count
                FROM job_runs
                WHERE status = 'SUCCESS' AND username = ?
                GROUP BY job_id
            """, (username,))
            stats = {row["job_id"]: {"avg_duration": row["avg_duration"], "job_name": row["job_name"]} for row in cursor.fetchall()}
            
            # Query the latest run for each job
            cursor.execute("""
                SELECT id, job_id, job_name, status, duration, start_time, rows_read, rows_written
                FROM job_runs
                WHERE username = ? AND id IN (
                    SELECT MAX(id) FROM job_runs WHERE username = ? GROUP BY job_id
                )
            """, (username, username))
            latest_runs = cursor.fetchall()
            
            anomalies = []
            for run in latest_runs:
                job_id = run["job_id"]
                if job_id in stats:
                    avg_dur = stats[job_id]["avg_duration"]
                    current_dur = run["duration"]
                    
                    # Flag as anomaly if the current duration is > 1.5 times the average (and at least 10 seconds long)
                    if avg_dur > 0 and current_dur > 1.5 * avg_dur and current_dur > 10:
                        deviation_percent = round(((current_dur - avg_dur) / avg_dur) * 100, 1)
                        anomalies.append({
                            "run_id": run["id"],
                            "job_id": job_id,
                            "job_name": run["job_name"],
                            "status": run["status"],
                            "duration": current_dur,
                            "avg_duration": round(avg_dur, 2),
                            "deviation_percent": deviation_percent,
                            "start_time": run["start_time"],
                            "rows_processed": run["rows_read"] + run["rows_written"]
                        })
            
            return anomalies
    except Exception as e:
        logger.error(f"Error computing anomalies: {e}")
        raise HTTPException(status_code=500, detail="Database fetch failed")

class ConfigSchema(BaseModel):
    databricks_host: str
    databricks_token: str

@app.get("/api/config")
async def get_config(username: str = Depends(get_current_user)):
    """Returns user-specific Databricks configuration settings."""
    cfg = get_user_config(username)
    if cfg is None:
        raise HTTPException(status_code=404, detail="User config not found")
    return {
        "databricks_host": cfg.get("databricks_host") or "",
        "databricks_token": cfg.get("databricks_token") or ""
    }

@app.post("/api/config")
async def save_config(payload: ConfigSchema, username: str = Depends(get_current_user)):
    """Saves user-specific Databricks configuration settings."""
    try:
        update_user_config(username, payload.databricks_host, payload.databricks_token)
        return {"status": "success", "message": "Configuration saved successfully."}
    except Exception as e:
        logger.error(f"Error saving config: {e}")
        raise HTTPException(status_code=500, detail="Failed to save configuration")

@app.post("/api/config/unlink")
async def unlink_config(username: str = Depends(get_current_user)):
    """Unlinks Databricks configuration and clears the user's fetched job/run telemetry."""
    try:
        update_user_config(username, "", "")
        
        from src.database import get_db_connection
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM job_runs WHERE username = ?", (username,))
            cursor.execute("DELETE FROM jobs WHERE username = ?", (username,))
            conn.commit()
            
        return {"status": "success", "message": "Databricks workspace unlinked successfully."}
    except Exception as e:
        logger.error(f"Error unlinking config: {e}")
        raise HTTPException(status_code=500, detail=f"Unlinking failed: {str(e)}")

@app.post("/api/test-connection")
async def test_databricks_connection(payload: ConfigSchema, username: str = Depends(get_current_user)):
    """
    Verifies connection and credentials to Databricks Workspace.
    Useful for diagnostic checks.
    """
    user_collector = DatabricksCollector(host=payload.databricks_host, token=payload.databricks_token)
    success, message = user_collector.verify_connection()
    return {
        "status": "success" if success else "error",
        "message": message,
        "host": user_collector.host,
        "has_sdk": hasattr(user_collector, "client") and user_collector.client is not None
    }

@app.post("/api/collect")
async def collect_metadata(username: str = Depends(get_current_user)):
    """
    Triggers an on-demand synchronization job.
    Fetches the latest job run configurations from Databricks API or simulates new ones.
    """
    user_collector = get_user_collector(username)
    if user_collector and user_collector.is_configured():
        try:
            logger.info(f"Executing on-demand Databricks collection for user {username}...")
            jobs = user_collector.discover_jobs()
            for job in jobs:
                upsert_job(job, username)
                
            runs = user_collector.collect()
            for run in runs:
                upsert_job_run(run, username)
                
            return {
                "status": "success",
                "message": f"Successfully pulled metadata from Databricks API: {len(jobs)} jobs, {len(runs)} runs updated."
            }
        except Exception as e:
            logger.error(f"Databricks sync failed: {e}")
            raise HTTPException(status_code=500, detail=f"Synchronization failed: {str(e)}")
    else:
        raise HTTPException(
            status_code=400,
            detail="Databricks connection is not configured. Please open Databricks Config and set your Host and Token."
        )

