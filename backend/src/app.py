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
    create_user, get_user
)
from src.collectors.databricks import DatabricksCollector
from src.data_generator import PIPELINES

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
        return username
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# State variables
collector = None

async def simulation_loop():
    """
    Background simulation worker.
    Periodically starts new job executions and updates existing RUNNING jobs to SUCCESS/FAILED.
    This runs only if Databricks Collector is not fully operational (for demo/eval purposes).
    """
    logger.info("Starting background telemetry simulation loop...")
    while True:
        try:
            # 1. Update any existing active runs
            running_runs = get_job_runs(limit=100, status="RUNNING")
            for run in running_runs:
                # 30% chance of finishing on each tick
                if random.random() < 0.3:
                    # Find matching configuration
                    matching_pipe = next((p for p in PIPELINES if p["name"] == run["job_name"]), None)
                    failure_rate = matching_pipe["failure_rate"] if matching_pipe else 0.05
                    errors = matching_pipe["errors"] if matching_pipe else ["Runtime error"]
                    avg_duration = matching_pipe["avg_duration"] if matching_pipe else 300

                    is_failed = random.random() < failure_rate
                    status = "FAILED" if is_failed else "SUCCESS"
                    error_message = random.choice(errors) if is_failed else None
                    
                    start_time = datetime.fromisoformat(run["start_time"].replace("Z", ""))
                    end_time = datetime.utcnow()
                    duration = (end_time - start_time).total_seconds()
                    
                    rows_read = run["rows_read"] or random.randint(1000, 50000)
                    rows_written = int(rows_read * random.uniform(0.9, 1.0)) if not is_failed else 0

                    updated_run = JobRunSchema(
                        id=run["id"],
                        job_id=run["job_id"],
                        job_name=run["job_name"],
                        status=status,
                        start_time=run["start_time"],
                        end_time=end_time.isoformat() + "Z",
                        duration=round(duration, 2),
                        rows_read=rows_read,
                        rows_written=rows_written,
                        error_message=error_message,
                        collected_at=datetime.utcnow().isoformat() + "Z"
                    )
                    upsert_job_run(updated_run)
                    logger.info(f"[Simulator] Updated run {run['id']} ({run['job_name']}) -> {status}")

            # 2. 20% chance of starting a new run
            if random.random() < 0.2:
                pipe = random.choice(PIPELINES)
                
                # Check if there is already a RUNNING job for this pipeline
                already_running = any(r["job_name"] == pipe["name"] for r in running_runs)
                if not already_running:
                    run_id = f"dbx-run-{uuid.uuid4().hex[:12]}"
                    now_utc = datetime.utcnow()
                    rows_read = random.randint(*pipe["rows_range"]) if pipe["rows_range"][0] > 0 else 0
                    
                    new_run = JobRunSchema(
                        id=run_id,
                        job_id=pipe["id"],
                        job_name=pipe["name"],
                        status="RUNNING",
                        start_time=now_utc.isoformat() + "Z",
                        end_time=None,
                        duration=0.0,
                        rows_read=rows_read,
                        rows_written=0,
                        error_message=None,
                        collected_at=now_utc.isoformat() + "Z"
                    )
                    upsert_job_run(new_run)
                    logger.info(f"[Simulator] Spawning new run {run_id} ({pipe['name']})")

        except Exception as e:
            logger.error(f"Error in simulation loop: {e}")
        
        await asyncio.sleep(12)  # Check loop every 12 seconds

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Init database
    init_db()
    
    # Initialize Databricks Collector
    global collector
    collector = DatabricksCollector()
    
    # If not configured, populate database with initial set of historical runs for demonstration
    runs = get_job_runs(limit=1)
    if not runs:
        logger.info("Database is empty. Pre-populating with historical metadata runs...")
        from src.data_generator import generate_mock_data
        generate_mock_data(days=3)
    
    # Start the simulation loop task in the background
    # Only run the simulator if Databricks Collector is not configured to fetch live jobs
    sim_task = None
    if not collector.is_configured():
        logger.info("Databricks credentials not found. Running in SIMULATED environment mode.")
        sim_task = asyncio.create_task(simulation_loop())
    else:
        logger.info("Databricks credentials configured. Running in LIVE environment mode.")
        
    yield
    
    # Shutdown
    if sim_task:
        sim_task.cancel()
        try:
            await sim_task
        except asyncio.CancelledError:
            pass

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
        return get_kpis()
    except Exception as e:
        logger.error(f"Error computing KPIs: {e}")
        raise HTTPException(status_code=500, detail="Database fetch failed")

@app.get("/api/runs")
async def get_runs(limit: int = 50, status: Optional[str] = None, job_id: Optional[str] = None, username: str = Depends(get_current_user)):
    """Returns list of job runs filtered by status and/or job_id."""
    try:
        return get_job_runs(limit=limit, status=status, job_id=job_id)
    except Exception as e:
        logger.error(f"Error fetching runs: {e}")
        raise HTTPException(status_code=500, detail="Database fetch failed")

@app.get("/api/duration-history")
async def get_durations(limit: int = 20, username: str = Depends(get_current_user)):
    """Returns run duration series data for plotting charts."""
    try:
        return get_duration_history(limit=limit)
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
                WHERE status = 'SUCCESS'
                GROUP BY job_id
            """)
            stats = {row["job_id"]: {"avg_duration": row["avg_duration"], "job_name": row["job_name"]} for row in cursor.fetchall()}
            
            # Query the latest run for each job
            cursor.execute("""
                SELECT id, job_id, job_name, status, duration, start_time, rows_read, rows_written
                FROM job_runs
                WHERE id IN (
                    SELECT MAX(id) FROM job_runs GROUP BY job_id
                )
            """)
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

@app.get("/api/config")
async def get_config():
    """Returns configuration settings like Databricks Host URL."""
    return {
        "databricks_host": os.environ.get("DATABRICKS_HOST", "")
    }

@app.get("/api/test-connection")
async def test_databricks_connection(username: str = Depends(get_current_user)):
    """
    Verifies connection and credentials to Databricks Workspace.
    Useful for diagnostic checks.
    """
    global collector
    if not collector:
        collector = DatabricksCollector()
        
    success, message = collector.verify_connection()
    return {
        "status": "success" if success else "error",
        "message": message,
        "host": collector.host,
        "has_sdk": hasattr(collector, "client") and collector.client is not None
    }

@app.post("/api/collect")
async def collect_metadata(username: str = Depends(get_current_user)):
    """
    Triggers an on-demand synchronization job.
    Fetches the latest job run configurations from Databricks API or simulates new ones.
    """
    global collector
    if collector and collector.is_configured():
        try:
            logger.info("Executing on-demand Databricks collection...")
            jobs = collector.discover_jobs()
            for job in jobs:
                upsert_job(job)
                
            runs = collector.collect()
            for run in runs:
                upsert_job_run(run)
                
            return {
                "status": "success",
                "message": f"Successfully pulled metadata from Databricks API: {len(jobs)} jobs, {len(runs)} runs updated."
            }
        except Exception as e:
            logger.error(f"Databricks sync failed: {e}")
            raise HTTPException(status_code=500, detail=f"Synchronization failed: {str(e)}")
    else:
        # Simulate a manual sync execution by creating new runs
        logger.info("Simulating on-demand Databricks collection...")
        new_runs_count = random.randint(1, 3)
        inserted_runs = []
        for _ in range(new_runs_count):
            pipe = random.choice(PIPELINES)
            run_id = f"dbx-run-sync-{uuid.uuid4().hex[:8]}"
            now_utc = datetime.utcnow()
            
            is_failed = random.random() < pipe["failure_rate"]
            duration = pipe["avg_duration"] * random.uniform(0.6, 1.3)
            rows_read = random.randint(*pipe["rows_range"]) if pipe["rows_range"][0] > 0 else 0
            rows_written = int(rows_read * random.uniform(0.9, 1.0)) if not is_failed else 0
            
            status = "FAILED" if is_failed else "SUCCESS"
            error_message = random.choice(pipe["errors"]) if is_failed else None
            
            run = JobRunSchema(
                id=run_id,
                job_id=pipe["id"],
                job_name=pipe["name"],
                status=status,
                start_time=(now_utc - timedelta(seconds=duration)).isoformat() + "Z",
                end_time=now_utc.isoformat() + "Z",
                duration=round(duration, 2),
                rows_read=rows_read,
                rows_written=rows_written,
                error_message=error_message,
                collected_at=now_utc.isoformat() + "Z"
            )
            upsert_job_run(run)
            inserted_runs.append(run.id)
            
        return {
            "status": "simulated",
            "message": f"Databricks credentials not configured. Simulated metadata fetch: ingested {new_runs_count} run logs.",
            "runs": inserted_runs
        }

