import os
import pytest
import tempfile
from src import database
from src.database import (
    init_db, upsert_job, upsert_job_run, get_kpis, get_job_runs,
    JobSchema, JobRunSchema, get_all_jobs, get_duration_history
)

@pytest.fixture(autouse=True)
def setup_test_db(monkeypatch):
    """Sets up a temporary SQLite database for each test to keep tests isolated."""
    # Create a temporary file path for the DB
    temp_db_fd, temp_db_path = tempfile.mkstemp(suffix=".db")
    os.close(temp_db_fd)
    
    # Override the DB_PATH variable in database module
    monkeypatch.setattr(database, "DB_PATH", temp_db_path)
    
    # Initialize the database tables
    init_db()
    
    yield temp_db_path
    
    # Cleanup after test runs
    if os.path.exists(temp_db_path):
        os.remove(temp_db_path)

def test_database_initialization():
    # Verify jobs and runs lists are initially empty
    assert len(get_all_jobs()) == 0
    assert len(get_job_runs()) == 0

def test_upsert_job():
    job = JobSchema(
        id="test-job-1",
        name="Ingestion Job",
        source="databricks",
        created_at="2026-07-12T12:00:00Z"
    )
    upsert_job(job)
    
    jobs = get_all_jobs()
    assert len(jobs) == 1
    assert jobs[0]["id"] == "test-job-1"
    assert jobs[0]["name"] == "Ingestion Job"
    assert jobs[0]["source"] == "databricks"

def test_upsert_job_run():
    # Insert job run (this should implicitly create the job if missing)
    run = JobRunSchema(
        id="test-run-1",
        job_id="test-job-1",
        job_name="Ingestion Job",
        status="SUCCESS",
        start_time="2026-07-12T12:00:00Z",
        end_time="2026-07-12T12:02:00Z",
        duration=120.0,
        rows_read=5000,
        rows_written=4950,
        error_message=None
    )
    upsert_job_run(run)
    
    runs = get_job_runs()
    assert len(runs) == 1
    assert runs[0]["id"] == "test-run-1"
    assert runs[0]["status"] == "SUCCESS"
    assert runs[0]["duration"] == 120.0
    assert runs[0]["rows_read"] == 5000
    assert runs[0]["rows_written"] == 4950

def test_kpi_computation():
    # Seed various runs with different statuses
    run1 = JobRunSchema(
        id="run-1", job_id="job-1", job_name="Job A",
        status="SUCCESS", start_time="2026-07-12T12:00:00Z",
        end_time="2026-07-12T12:01:00Z", duration=60.0,
        rows_read=1000, rows_written=1000
    )
    run2 = JobRunSchema(
        id="run-2", job_id="job-1", job_name="Job A",
        status="FAILED", start_time="2026-07-12T12:10:00Z",
        end_time="2026-07-12T12:11:00Z", duration=60.0,
        rows_read=500, rows_written=0,
        error_message="Network Timeout"
    )
    run3 = JobRunSchema(
        id="run-3", job_id="job-2", job_name="Job B",
        status="RUNNING", start_time="2026-07-12T12:20:00Z",
        duration=0.0, rows_read=0, rows_written=0
    )
    
    upsert_job_run(run1)
    upsert_job_run(run2)
    upsert_job_run(run3)
    
    kpis = get_kpis()
    
    assert kpis.total_runs == 3
    assert kpis.success_runs == 1
    assert kpis.failed_runs == 1
    assert kpis.running_runs == 1
    assert kpis.failure_rate == 33.33  # 1 failed out of 3 runs
    assert kpis.avg_duration == 60.0   # Avg of completed run durations (60 + 60) / 2
    assert kpis.total_rows_read == 1500
    assert kpis.total_rows_written == 1000

def test_duration_history():
    for i in range(5):
        run = JobRunSchema(
            id=f"run-{i}", job_id="job-1", job_name="Job A",
            status="SUCCESS", start_time=f"2026-07-12T12:0{i}:00Z",
            duration=10.0 * i, rows_read=100, rows_written=100
        )
        upsert_job_run(run)
        
    history = get_duration_history(limit=3)
    assert len(history) == 3
    # Check that sorting is ascending by start_time (start_time ASC)
    assert history[0].run_id == "run-0"
    assert history[1].run_id == "run-1"
    assert history[2].run_id == "run-2"
