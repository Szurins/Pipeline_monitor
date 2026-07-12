# Cross-Platform Data Pipeline Monitor & Metadata Collection Tool

A lightweight, extensible data pipeline execution monitor and metadata collector built with Python, SQLite, and FastAPI. This application provides active log ingestion and highlights key telemetry states (Success, Failed, and Running) with a modern, glassmorphic dark-mode web dashboard.

---

## 🌟 Key Features

*   **Modular Architecture**: Uses an abstract collector framework so adapters for Databricks, Snowflake, BigQuery, and other platforms can be plugged in easily.
*   **Databricks Jobs Integration**: Native support for listing job configurations and run logs using the official `databricks-sdk`.
*   **Lightweight Persistence**: Uses SQLite for quick local storage with a simple schema structure.
*   **Interactive Web UI**: Real-time FastAPI single-page application dashboard featuring:
    *   **KPI Summary Panel**: Displays total runs, failure rates, average durations, and total processing volumes.
    *   **Telemetry List Grid**: Displays status tags (Success, Failed, Running) with error logs inspectable in a detail popover.
    *   **Chart Analytics**: Plots run durations over time using Chart.js.
    *   **On-Demand Sync**: Pulls new logs manually with a single click.
*   **Auto-Simulation Mode**: If live Databricks credentials are not configured, the dashboard falls back to a mock simulation mode with active run state transitions to demonstrate the dashboard features out-of-the-box.

---

## 🛠️ Codebase Structure

```text
pipeline_monitor/
├── src/
│   ├── __init__.py
│   ├── app.py            # FastAPI API & Web server
│   ├── database.py       # SQLite models, KPIs, and DB interface
│   ├── data_generator.py # Populates initial mock run logs
│   └── collectors/
│       ├── __init__.py
│       ├── base.py       # Abstract Base Collector
│       └── databricks.py # Databricks Jobs API Collector
├── requirements.txt
└── README.md
```

---

## ⚙️ Setup & Installation

### 1. Prerequisites
Ensure you have **Python 3.8+** installed.

### 2. Install Dependencies
Clone this repository, navigate to the folder, and run:
```bash
pip install -r requirements.txt
```

### 3. Generate Mock Data (Optional)
If you want to pre-populate the dashboard database with historical run logs before starting the web server, run:
```bash
python -m src.data_generator --days 5
```

---

## 🚀 Running the Web Dashboard

Start the FastAPI application using Uvicorn:
```bash
uvicorn src.app:app --reload --port 8000
```
Then, open your web browser and navigate to: **[http://localhost:8000/](http://localhost:8000/)**

---

## ⚙️ Configuration & Environment Variables

You can configure the application using environment variables or a local `.env` file in the project root. To get started, copy the template:
```bash
cp .env.example .env
```

### Supported Configuration Keys

| Variable | Description | Default | Required for Live Mode? |
| :--- | :--- | :--- | :--- |
| `PIPELINE_MONITOR_DB` | Path to the SQLite local database file. | `pipeline_monitor.db` | No |
| `DATABRICKS_HOST` | The complete URL of your Databricks Workspace (e.g. `https://adb-1234567.8.azuredatabricks.net`). | *None* | **Yes** |
| `DATABRICKS_TOKEN` | A Databricks Personal Access Token (PAT) used for authentication. | *None* | **Yes** |

---

## 🔗 Connecting to Live Databricks

The [DatabricksCollector](file:///C:/Users/Łukasz/Desktop/Pipeline_monitor/src/collectors/databricks.py#L19) relies on the official `databricks-sdk` unified client authentication framework. To connect it to your live Databricks environment:

### 1. Generating a Databricks Personal Access Token (PAT)
1. Log in to your Databricks workspace.
2. In the top right corner of the workspace, click your user name and select **User Settings**.
3. Go to the **Developer** tab.
4. Next to **Access tokens**, click **Manage**.
5. Click **Generate new token**.
6. (Optional) Enter a comment (e.g., `pipeline-monitor-token`) and set a lifetime.
7. Click **Generate** and **copy the token value immediately** (you will not be able to view it again).

> [!IMPORTANT]
> **Token Permission Requirements:**
> * **Workspace Access**: The token inherits the permissions of the User or Service Principal that generated it.
> * **Job-Level Access**: The token owner must have at least **`CAN VIEW`** permissions on the Databricks Jobs/Workflows you want to monitor. If the owner is a **Workspace Admin**, they can monitor all workspace jobs.
> * **Production Recommendation**: For production monitoring, generate a token for a **Service Principal** and assign it **`CAN VIEW`** access to the specific jobs to adhere to the principle of least privilege.


### 2. Configuring the Application
Place the host URL and token into your `.env` file in the project root:
```ini
# .env
DATABRICKS_HOST="https://adb-xxxxxxxxxxxx.x.azuredatabricks.net"
DATABRICKS_TOKEN="dapi-xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

*Note: The application will automatically detect these values from your `.env` file on startup. If set, it will disable the background telemetry simulation loop and fetch live metadata from the Databricks Jobs API when synchronized.*

### 3. Alternative Authentication Methods (SDK Unified Auth)
Because we use the official Databricks SDK WorkspaceClient, the collector also supports standard ambient authentication:
*   **Databricks CLI Config Profile**: Setting `DATABRICKS_CONFIG_PROFILE` if your configurations are saved in `~/.databrickscfg`.
*   **Azure/AWS Native Auth**: The SDK can automatically resolve credentials using active Azure CLI sessions or AWS environment credentials if permissions are configured on the workspace.

