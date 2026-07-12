import random
import uuid
import argparse
from datetime import datetime, timedelta
from src.database import init_db, upsert_job, upsert_job_run, JobSchema, JobRunSchema

PIPELINES = [
    {
        "id": "dbx-job-101",
        "name": "dwh_ingestion_users",
        "avg_duration": 45,  # seconds
        "rows_range": (10000, 50000),
        "schedule_hours": 1,
        "failure_rate": 0.05,
        "errors": [
            "Connection reset by peer (Stripe API)",
            "Rate limit exceeded (HTTP 429)",
            "Invalid character sequence in JSON payload at line 452"
        ]
    },
    {
        "id": "dbx-job-102",
        "name": "dwh_transform_sales",
        "avg_duration": 350,  # seconds
        "rows_range": (200000, 1000000),
        "schedule_hours": 4,
        "failure_rate": 0.08,
        "errors": [
            "AnalysisException: Table 'raw.sales_events' not found",
            "SparkException: Job aborted due to stage failure: Executor lost",
            "Delta Protocol Error: Reader version 3 required"
        ]
    },
    {
        "id": "dbx-job-103",
        "name": "dwh_agg_finance",
        "avg_duration": 120,  # seconds
        "rows_range": (5000, 25000),
        "schedule_hours": 12,
        "failure_rate": 0.04,
        "errors": [
            "AssertionError: Sum of debits and credits does not balance",
            "LockException: Directory is locked by another transaction"
        ]
    },
    {
        "id": "dbx-job-104",
        "name": "ml_churn_prediction",
        "avg_duration": 1800,  # seconds
        "rows_range": (500000, 2000000),
        "schedule_hours": 24,
        "failure_rate": 0.15,
        "errors": [
            "OutOfMemoryError: Container killed by YARN for exceeding memory limits",
            "ValueError: Input contains NaN values in feature column 'last_login_delta'",
            "MLflowException: Failed to connect to tracking server at http://mlflow.internal"
        ]
    },
    {
        "id": "dbx-job-105",
        "name": "delta_optimizer_vacuum",
        "avg_duration": 600,  # seconds
        "rows_range": (0, 0),  # vacuum deletes files rather than reading table rows
        "schedule_hours": 24,
        "failure_rate": 0.02,
        "errors": [
            "ConcurrentAppendException: Files were added to partition during vacuum run",
            "InvalidConfigurationException: retention threshold cannot be less than 168 hours"
        ]
    }
]

def generate_mock_data(days: int = 7, clear_existing: bool = False):
    print(f"Initializing database at path...")
    init_db()
    
    now = datetime.utcnow()
    total_inserted = 0

    print(f"Generating pipeline runs metadata for the last {days} days...")
    
    # 1. Register all core pipelines as Jobs
    for pipe in PIPELINES:
        job = JobSchema(
            id=pipe["id"],
            name=pipe["name"],
            source="databricks",
            created_at=(now - timedelta(days=days + 1)).isoformat() + "Z"
        )
        upsert_job(job)

    # 2. Generate historical runs
    for pipe in PIPELINES:
        start_date = now - timedelta(days=days)
        interval = timedelta(hours=pipe["schedule_hours"])
        
        current_time = start_date
        while current_time < now:
            # Randomize schedule time slightly to look organic
            jitter = random.randint(-600, 600)  # +/- 10 mins
            run_start = current_time + timedelta(seconds=jitter)
            
            # Determine run state
            is_failed = random.random() < pipe["failure_rate"]
            
            # Duration variation: +/- 20%
            duration = pipe["avg_duration"] * random.uniform(0.8, 1.2)
            
            run_end = run_start + timedelta(seconds=duration)
            
            # Populate metrics
            rows_read = random.randint(*pipe["rows_range"]) if pipe["rows_range"][0] > 0 else 0
            rows_written = int(rows_read * random.uniform(0.9, 1.0)) if rows_read > 0 else 0
            
            run_id = f"dbx-run-{uuid.uuid4().hex[:12]}"
            
            if is_failed:
                status = "FAILED"
                error_message = random.choice(pipe["errors"])
                # Failed runs might fail early, so duration is shorter
                duration = duration * random.uniform(0.1, 0.7)
                run_end = run_start + timedelta(seconds=duration)
            else:
                status = "SUCCESS"
                error_message = None
            
            # If the run falls within the last 15 minutes, there's a chance it's currently RUNNING
            if now - timedelta(minutes=15) < run_start < now:
                if random.random() < 0.5:
                    status = "RUNNING"
                    run_end = None
                    duration = (now - run_start).total_seconds()
                    error_message = None
            
            run = JobRunSchema(
                id=run_id,
                job_id=pipe["id"],
                job_name=pipe["name"],
                status=status,
                start_time=run_start.isoformat() + "Z",
                end_time=run_end.isoformat() + "Z" if run_end else None,
                duration=round(duration, 2),
                rows_read=rows_read,
                rows_written=rows_written,
                error_message=error_message,
                collected_at=now.isoformat() + "Z"
            )
            
            upsert_job_run(run)
            total_inserted += 1
            
            current_time += interval

    print(f"Successfully generated and stored {total_inserted} run records in SQLite.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate mock pipeline data for Databricks Jobs API.")
    parser.add_argument("--days", type=int, default=7, help="Number of historical days to generate data for.")
    args = parser.parse_args()
    generate_mock_data(days=args.days)
