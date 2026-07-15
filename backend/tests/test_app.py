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

@pytest.fixture
def auth_headers(client):
    # Register
    client.post("/api/auth/register", json={"username": "testuser", "password": "testpassword"})
    # Login
    response = client.post("/api/auth/login", json={"username": "testuser", "password": "testpassword"})
    token = response.json()["token"]
    return {"Authorization": f"Bearer {token}"}

def test_get_dashboard_index(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "Pipeline Run Monitor" in response.text
    assert "text/html" in response.headers["content-type"]

def test_api_kpis(client, auth_headers):
    response = client.get("/api/kpis", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "total_runs" in data
    assert "failure_rate" in data
    assert "avg_duration" in data
    assert "total_rows_read" in data

def test_api_runs(client, auth_headers):
    response = client.get("/api/runs", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)

def test_api_duration_history(client, auth_headers):
    response = client.get("/api/duration-history", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)

def test_api_collect_unconfigured(client, auth_headers):
    # Triggers an on-demand sync. Since we don't have databricks credentials configured in testing,
    # it must return a 400 Bad Request.
    response = client.post("/api/collect", headers=auth_headers)
    assert response.status_code == 400
    data = response.json()
    assert "detail" in data
    assert "configured" in data["detail"]

def test_api_test_connection(client, auth_headers):
    # POST endpoint verifying connection
    response = client.post("/api/test-connection", json={"databricks_host": "https://adb-12345.azuredatabricks.net", "databricks_token": "dapi123"}, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "message" in data
    assert "host" in data

