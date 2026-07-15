import os
import sqlite3
import base64
from hashlib import sha256
from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from dotenv import load_dotenv
from cryptography.fernet import Fernet

load_dotenv()

DB_PATH = os.environ.get("PIPELINE_MONITOR_DB", "pipeline_monitor.db")

# Symmetric encryption setup for Databricks tokens
_secret = os.environ.get("ENCRYPTION_KEY", "fallback-secret-for-databricks-token-encryption-2026")
_key = base64.urlsafe_b64encode(sha256(_secret.encode("utf-8")).digest())
cipher = Fernet(_key)

def encrypt_token(token: str) -> str:
    if not token:
        return ""
    return cipher.encrypt(token.encode("utf-8")).decode("utf-8")

def decrypt_token(encrypted_token: str) -> str:
    if not encrypted_token:
        return ""
    try:
        return cipher.decrypt(encrypted_token.encode("utf-8")).decode("utf-8")
    except Exception:
        # Fallback to plain text in case of unencrypted data or transition
        return encrypted_token


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
        
        # Check jobs table and migrate if needed
        cursor.execute("PRAGMA table_info(jobs)")
        columns = [row[1] for row in cursor.fetchall()]
        if columns and "username" not in columns:
            cursor.execute("ALTER TABLE jobs RENAME TO jobs_old")
            cursor.execute("""
                CREATE TABLE jobs (
                    id TEXT,
                    username TEXT NOT NULL DEFAULT '',
                    name TEXT NOT NULL,
                    source TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id, username)
                )
            """)
            cursor.execute("INSERT INTO jobs (id, username, name, source, created_at) SELECT id, '', name, source, created_at FROM jobs_old")
            cursor.execute("DROP TABLE jobs_old")
        elif not columns:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT,
                    username TEXT NOT NULL DEFAULT '',
                    name TEXT NOT NULL,
                    source TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id, username)
                )
            """)
        
        # Check job_runs table and migrate if needed
        cursor.execute("PRAGMA table_info(job_runs)")
        columns = [row[1] for row in cursor.fetchall()]
        if columns and "username" not in columns:
            cursor.execute("ALTER TABLE job_runs RENAME TO job_runs_old")
            cursor.execute("""
                CREATE TABLE job_runs (
                    id TEXT,
                    username TEXT NOT NULL DEFAULT '',
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
                    PRIMARY KEY (id, username),
                    FOREIGN KEY(job_id, username) REFERENCES jobs(id, username)
                )
            """)
            cursor.execute("""
                INSERT INTO job_runs (id, username, job_id, job_name, status, start_time, end_time, duration, rows_read, rows_written, error_message, collected_at)
                SELECT id, '', job_id, job_name, status, start_time, end_time, duration, rows_read, rows_written, error_message, collected_at FROM job_runs_old
            """)
            cursor.execute("DROP TABLE job_runs_old")
        elif not columns:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS job_runs (
                    id TEXT,
                    username TEXT NOT NULL DEFAULT '',
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
                    PRIMARY KEY (id, username),
                    FOREIGN KEY(job_id, username) REFERENCES jobs(id, username)
                )
            """)
        
        # Create indexes for performance optimization
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_job_runs_job_id_username_start_time ON job_runs(job_id, username, start_time DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_job_runs_status_username ON job_runs(status, username)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_job_runs_username_start_time ON job_runs(username, start_time DESC)")
        
        # Create users table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL,
                databricks_host TEXT,
                databricks_token TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # In case the table existed without these columns:
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN databricks_host TEXT")
        except sqlite3.OperationalError:
            pass
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN databricks_token TEXT")
        except sqlite3.OperationalError:
            pass
        conn.commit()

def upsert_job(job: JobSchema, username: str):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO jobs (id, username, name, source, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id, username) DO UPDATE SET
                name = excluded.name,
                source = excluded.source
        """, (job.id, username, job.name, job.source, job.created_at))
        conn.commit()

def upsert_job_run(run: JobRunSchema, username: str):
    # First, make sure the job exists (mock insert if not exists)
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM jobs WHERE id = ? AND username = ?", (run.job_id, username))
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO jobs (id, username, name, source, created_at)
                VALUES (?, ?, ?, ?, datetime('now'))
            """, (run.job_id, username, run.job_name, "databricks"))
        
        collected_at = run.collected_at or datetime.utcnow().isoformat()
        
        cursor.execute("""
            INSERT INTO job_runs (id, username, job_id, job_name, status, start_time, end_time, duration, rows_read, rows_written, error_message, collected_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id, username) DO UPDATE SET
                status = excluded.status,
                end_time = excluded.end_time,
                duration = excluded.duration,
                rows_read = excluded.rows_read,
                rows_written = excluded.rows_written,
                error_message = excluded.error_message,
                collected_at = excluded.collected_at
        """, (
            run.id, username, run.job_id, run.job_name, run.status,
            run.start_time, run.end_time, run.duration,
            run.rows_read, run.rows_written, run.error_message,
            collected_at
        ))
        conn.commit()

def get_all_jobs(username: str) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM jobs WHERE username = ? ORDER BY name ASC", (username,))
        return [dict(row) for row in cursor.fetchall()]

def get_job_runs(limit: int = 100, status: Optional[str] = None, job_id: Optional[str] = None, username: Optional[str] = None) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        query = """
            SELECT jr.id, jr.username, jr.job_id, jr.job_name, jr.status, jr.start_time, jr.end_time, 
                   jr.duration, jr.rows_read, jr.rows_written, jr.error_message, 
                   jr.collected_at, j.source
            FROM job_runs jr
            JOIN jobs j ON jr.job_id = j.id AND jr.username = j.username
        """
        conditions = []
        params = []
        if username is not None:
            conditions.append("jr.username = ?")
            params.append(username)
        if status:
            conditions.append("jr.status = ?")
            params.append(status)
        if job_id:
            conditions.append("jr.job_id = ?")
            params.append(job_id)
            
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
            
        query += " ORDER BY jr.start_time DESC LIMIT ?"
        params.append(limit)
        
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]


def get_kpis(username: str) -> KPISchema:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM job_runs WHERE username = ?", (username,))
        total_runs = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM job_runs WHERE status = 'SUCCESS' AND username = ?", (username,))
        success_runs = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM job_runs WHERE status = 'FAILED' AND username = ?", (username,))
        failed_runs = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM job_runs WHERE status = 'RUNNING' AND username = ?", (username,))
        running_runs = cursor.fetchone()[0]
        
        cursor.execute("SELECT AVG(duration) FROM job_runs WHERE status IN ('SUCCESS', 'FAILED') AND username = ?", (username,))
        avg_duration_row = cursor.fetchone()
        avg_duration = avg_duration_row[0] if avg_duration_row and avg_duration_row[0] is not None else 0.0
        
        cursor.execute("SELECT SUM(rows_read), SUM(rows_written) FROM job_runs WHERE username = ?", (username,))
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

def get_duration_history(limit: int = 50, username: str = "") -> List[DurationPointSchema]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT job_name, id as run_id, start_time, duration, status
            FROM job_runs
            WHERE username = ?
            ORDER BY start_time ASC
            LIMIT ?
        """, (username, limit))
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

def create_user(username: str, password_hash: str):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO users (username, password_hash)
            VALUES (?, ?)
        """, (username, password_hash))
        conn.commit()

def get_user(username: str) -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT username, password_hash, databricks_host, databricks_token, created_at FROM users WHERE username = ?", (username,))
        row = cursor.fetchone()
        if row:
            return dict(row)
        return None

def update_user_config(username: str, host: str, token: str):
    encrypted = encrypt_token(token)
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE users
            SET databricks_host = ?, databricks_token = ?
            WHERE username = ?
        """, (host, encrypted, username))
        conn.commit()

def get_user_config(username: str) -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT databricks_host, databricks_token FROM users WHERE username = ?", (username,))
        row = cursor.fetchone()
        if row:
            decrypted = decrypt_token(row["databricks_token"] or "")
            return {"databricks_host": row["databricks_host"] or "", "databricks_token": decrypted}
        return None

def get_users_without_config() -> List[str]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT username FROM users WHERE databricks_host IS NULL OR databricks_host = ''")
        return [row["username"] for row in cursor.fetchall()]
