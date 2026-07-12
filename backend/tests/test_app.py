import os
import pytest
import tempfile
from fastapi.testclient import TestClient

# We use a pytest fixture to set the test database environment variable BEFORE importing app
@pytest.fixture(scope="module", autouse=True)
def test_env():
    # Setup temporary database file
    temp_db_fd, temp_db_path = tempfile.mkstemp(suffix=".db")
    os.close(temp_db_fd)
    
    # Set environment variable so src.database uses it
    os.environ["PIPELINE_MONITOR_DB"] = temp_db_path
    
    # Initialize the database schemas
    from src.database import init_db
    init_db()
    
    yield temp_db_path
    
    # Cleanup
    if os.path.exists(temp_db_path):
        os.remove(temp_db_path)
    os.environ.pop("PIPELINE_MONITOR_DB", None)

@pytest.fixture
def client():
    # Import app inside fixture so environment variables are loaded
    from src.app import app
    return TestClient(app)

def test_get_dashboard_index(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "Pipeline Run Monitor" in response.text
    assert "text/html" in response.headers["content-type"]

def test_api_kpis(client):
    response = client.get("/api/kpis")
    assert response.status_code == 200
    data = response.json()
    assert "total_runs" in data
    assert "failure_rate" in data
    assert "avg_duration" in data
    assert "total_rows_read" in data

def test_api_runs(client):
    response = client.get("/api/runs")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)

def test_api_duration_history(client):
    response = client.get("/api/duration-history")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)

def test_api_collect_simulated(client):
    # Triggers an on-demand sync. Since we don't have databricks-sdk credentials configured in testing,
    # it must fall back to simulated synchronization, inserting 1-3 new run logs.
    response = client.post("/api/collect")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "simulated"
    assert "runs" in data
    assert len(data["runs"]) >= 1

def test_api_test_connection(client):
    response = client.get("/api/test-connection")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "message" in data
    assert "host" in data

