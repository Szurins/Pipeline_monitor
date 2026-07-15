import logging
from datetime import datetime
from typing import List, Optional
import os

from src.database import JobSchema, JobRunSchema
from src.collectors.base import BaseCollector

logger = logging.getLogger(__name__)

# Try importing the Databricks SDK. If not installed or missing, we handle it.
try:
    from databricks.sdk import WorkspaceClient
    from databricks.sdk.service.jobs import RunLifeCycleState, RunResultState
    HAS_DATABRICKS_SDK = True
except ImportError:
    HAS_DATABRICKS_SDK = False

class DatabricksCollector(BaseCollector):
    """
    Metadata collector for Databricks Jobs API.
    Uses the official databricks-sdk to list jobs and run histories.
    """
    def __init__(self, host: Optional[str] = None, token: Optional[str] = None):
        self.host = host or os.environ.get("DATABRICKS_HOST")
        self.token = token or os.environ.get("DATABRICKS_TOKEN")
        self.client = None

        if not HAS_DATABRICKS_SDK:
            logger.warning("databricks-sdk is not installed. DatabricksCollector will not function.")
            return

        # WorkspaceClient can auto-authenticate from environment or config profiles
        try:
            if self.host and self.token:
                self.client = WorkspaceClient(host=self.host, token=self.token)
            else:
                # Fallback to default SDK auth (env vars, ~/.databrickscfg)
                self.client = WorkspaceClient()
                logger.info("Initialized Databricks WorkspaceClient using ambient authentication.")
        except Exception as e:
            logger.error(f"Failed to initialize Databricks WorkspaceClient: {e}")

    def is_configured(self) -> bool:
        return HAS_DATABRICKS_SDK and self.client is not None

    def verify_connection(self) -> tuple[bool, str]:
        """
        Performs a lightweight API request to verify connectivity and credentials.
        Returns (success, message).
        """
        if not HAS_DATABRICKS_SDK:
            return False, "databricks-sdk package is not installed."
            
        if not self.host:
            return False, "DATABRICKS_HOST configuration setting is missing."
            
        if not self.token:
            return False, "DATABRICKS_TOKEN configuration setting is missing."
            
        try:
            if not self.client:
                self.client = WorkspaceClient(host=self.host, token=self.token)
            
            user_info = self.client.current_user.me()
            user_email = getattr(user_info, "user_name", "Unknown User")
            return True, f"Connection successful! Authenticated as: {user_email}"
        except Exception as e:
            return False, f"Connection failed: {str(e)}"


    def discover_jobs(self) -> List[JobSchema]:
        """Fetches active jobs from Databricks Workspace."""
        if not self.is_configured():
            logger.warning("Databricks SDK is not configured. Returning empty job list.")
            return []

        jobs_list = []
        try:
            for job in self.client.jobs.list():
                created_time = datetime.utcfromtimestamp(job.created_time / 1000.0).isoformat() + "Z"
                jobs_list.append(JobSchema(
                    id=str(job.job_id),
                    name=job.settings.name or f"Job {job.job_id}",
                    source="databricks",
                    created_at=created_time
                ))
        except Exception as e:
            logger.error(f"Error fetching jobs from Databricks: {e}")
        
        return jobs_list

    def collect(self) -> List[JobRunSchema]:
        """Fetches job runs from Databricks Workspace."""
        if not self.is_configured():
            logger.warning("Databricks SDK is not configured. Returning empty runs list.")
            return []

        runs_list = []
        try:
            # Fetch last 25 runs to check status updates
            for run in self.client.jobs.list_runs(limit=25, expand_tasks=True):
                # Process start time
                start_time_iso = datetime.utcfromtimestamp(run.start_time / 1000.0).isoformat() + "Z"
                
                # Process end time
                end_time_iso = None
                if run.end_time:
                    end_time_iso = datetime.utcfromtimestamp(run.end_time / 1000.0).isoformat() + "Z"

                # Map lifecycle & result states to unified status (SUCCESS, FAILED, RUNNING, PENDING)
                status = "PENDING"
                life_state = run.state.life_cycle_state
                result_state = run.state.result_state

                if life_state in [RunLifeCycleState.RUNNING, RunLifeCycleState.TERMINATING]:
                    status = "RUNNING"
                elif life_state == RunLifeCycleState.PENDING:
                    status = "PENDING"
                elif life_state == RunLifeCycleState.TERMINATED:
                    if result_state == RunResultState.SUCCESS:
                        status = "SUCCESS"
                    elif result_state and result_state.value in ["FAILED", "TIMEDOUT"]:
                        status = "FAILED"
                    else:
                        # Canceled or other states
                        status = "FAILED"
                elif life_state in [RunLifeCycleState.SKIPPED, RunLifeCycleState.INTERNAL_ERROR]:
                    status = "FAILED"

                # Calculate duration in seconds
                duration_secs = (run.execution_duration or 0) / 1000.0
                if duration_secs == 0 and run.end_time:
                    duration_secs = (run.end_time - run.start_time) / 1000.0

                # Extract read/written row counts from cluster/task metrics if available
                # In Databricks, these are often inside task execution results or custom properties.
                # Here we safely default to 0 and attempt to parse custom metrics if they are set in task outputs.
                rows_read = 0
                rows_written = 0
                
                # Try to scan task run logs/metrics for rows read/written
                if run.tasks:
                    for task in run.tasks:
                        # Some tasks expose cluster or system metrics, but they aren't standardized.
                        # As a convention, we check task settings/descriptions or tags if available,
                        # but in standard Databricks jobs we fallback to a safe 0 (unless populated via our simulator).
                        pass

                error_message = run.state.state_message or None
                if status == "FAILED" and not error_message:
                    error_message = f"Run terminated with result state: {result_state.value if result_state else 'Unknown'}"

                runs_list.append(JobRunSchema(
                    id=str(run.run_id),
                    job_id=str(run.job_id),
                    job_name=run.run_name or f"Job {run.job_id}",
                    status=status,
                    start_time=start_time_iso,
                    end_time=end_time_iso,
                    duration=duration_secs,
                    rows_read=rows_read,
                    rows_written=rows_written,
                    error_message=error_message,
                    collected_at=datetime.utcnow().isoformat() + "Z"
                ))
        except Exception as e:
            logger.error(f"Error fetching runs from Databricks: {e}")

        return runs_list
