import os
import sqlite3
from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

DB_PATH = os.environ.get("PIPELINE_MONITOR_DB", "pipeline_monitor.db")


class JobSchema(BaseModel):
    id: str
    name: str
    source: str
    created_at: str

class JobRunSchema(BaseModel):
    id: str
    job_id: str
    job_name: str
    status: str  # SUCCESS, FAILED, RUNNING, PENDING
    start_time: str  # ISO-8601 UTC
    end_time: Optional[str] = None
    duration: float  # in seconds
    rows_read: int = 0
    rows_written: int = 0
    error_message: Optional[str] = None
    collected_at: Optional[str] = None

class KPISchema(BaseModel):
    total_runs: int
    success_runs: int
    failed_runs: int
    running_runs: int
    failure_rate: float  # Percentage
    avg_duration: float  # In seconds
    total_rows_read: int
    total_rows_written: int

class DurationPointSchema(BaseModel):
    job_name: str
    run_id: str
    start_time: str
    duration: float
    status: str

from contextlib import contextmanager

@contextmanager
def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def init_db():
    """Initializes the SQLite database schemas."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # Create jobs table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                source TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create job_runs table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS job_runs (
                id TEXT PRIMARY KEY,
                job_id TEXT NOT NULL,
                job_name TEXT NOT NULL,
                status TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT,
                duration REAL NOT NULL,
                rows_read INTEGER DEFAULT 0,
                rows_written INTEGER DEFAULT 0,
                error_message TEXT,
                collected_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(job_id) REFERENCES jobs(id)
            )
        """)
        conn.commit()

def upsert_job(job: JobSchema):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO jobs (id, name, source, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                source = excluded.source
        """, (job.id, job.name, job.source, job.created_at))
        conn.commit()

def upsert_job_run(run: JobRunSchema):
    # First, make sure the job exists (mock insert if not exists)
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM jobs WHERE id = ?", (run.job_id,))
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO jobs (id, name, source, created_at)
                VALUES (?, ?, ?, datetime('now'))
            """, (run.job_id, run.job_name, "databricks"))
        
        collected_at = run.collected_at or datetime.utcnow().isoformat()
        
        cursor.execute("""
            INSERT INTO job_runs (id, job_id, job_name, status, start_time, end_time, duration, rows_read, rows_written, error_message, collected_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                end_time = excluded.end_time,
                duration = excluded.duration,
                rows_read = excluded.rows_read,
                rows_written = excluded.rows_written,
                error_message = excluded.error_message,
                collected_at = excluded.collected_at
        """, (
            run.id, run.job_id, run.job_name, run.status,
            run.start_time, run.end_time, run.duration,
            run.rows_read, run.rows_written, run.error_message,
            collected_at
        ))
        conn.commit()

def get_all_jobs() -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM jobs ORDER BY name ASC")
        return [dict(row) for row in cursor.fetchall()]

def get_job_runs(limit: int = 100, status: Optional[str] = None) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        query = "SELECT * FROM job_runs"
        params = []
        if status:
            query += " WHERE status = ?"
            params.append(status)
        query += " ORDER BY start_time DESC LIMIT ?"
        params.append(limit)
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

def get_kpis() -> KPISchema:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM job_runs")
        total_runs = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM job_runs WHERE status = 'SUCCESS'")
        success_runs = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM job_runs WHERE status = 'FAILED'")
        failed_runs = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM job_runs WHERE status = 'RUNNING'")
        running_runs = cursor.fetchone()[0]
        
        cursor.execute("SELECT AVG(duration) FROM job_runs WHERE status IN ('SUCCESS', 'FAILED')")
        avg_duration_row = cursor.fetchone()
        avg_duration = avg_duration_row[0] if avg_duration_row and avg_duration_row[0] is not None else 0.0
        
        cursor.execute("SELECT SUM(rows_read), SUM(rows_written) FROM job_runs")
        totals_row = cursor.fetchone()
        total_rows_read = totals_row[0] if totals_row and totals_row[0] is not None else 0
        total_rows_written = totals_row[1] if totals_row and totals_row[1] is not None else 0
        
        failure_rate = (failed_runs / total_runs * 100.0) if total_runs > 0 else 0.0
        
        return KPISchema(
            total_runs=total_runs,
            success_runs=success_runs,
            failed_runs=failed_runs,
            running_runs=running_runs,
            failure_rate=round(failure_rate, 2),
            avg_duration=round(avg_duration, 2),
            total_rows_read=total_rows_read,
            total_rows_written=total_rows_written
        )

def get_duration_history(limit: int = 50) -> List[DurationPointSchema]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT job_name, id as run_id, start_time, duration, status
            FROM job_runs
            ORDER BY start_time ASC
            LIMIT ?
        """, (limit,))
        rows = cursor.fetchall()
        return [
            DurationPointSchema(
                job_name=row["job_name"],
                run_id=row["run_id"],
                start_time=row["start_time"],
                duration=row["duration"],
                status=row["status"]
            )
            for row in rows
        ]
