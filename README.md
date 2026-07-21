# Cross-Platform Data Pipeline Monitor & Metadata Collection Tool

A lightweight, extensible data pipeline execution monitor and metadata collector built with Python, SQLite, FastAPI, and React. This application provides active log ingestion and highlights key telemetry states (Success, Failed, and Running) with a modern web dashboard.

---

## 🌟 Key Features

*   **Modular Architecture**: Uses an abstract collector framework so adapters for Databricks, Snowflake, BigQuery, and other platforms can be plugged in easily.
*   **Databricks Jobs Integration**: Native support for listing job configurations and run logs using the official `databricks-sdk`.
*   **Lightweight Persistence**: Uses SQLite for quick local storage with a simple schema structure.
*   **Interactive Web UI**: Modern React single-page application dashboard featuring:
    *   **KPI Summary Panel**: Displays total runs, failure rates, average durations, and total processing volumes.
    *   **Telemetry List Grid**: Displays status tags (Success, Failed, Running) with error logs inspectable in a detail popover.
    *   **Chart Analytics**: Plots run durations over time.
    *   **On-Demand Sync**: Pulls new logs manually with a single click.
*   **Auto-Simulation Mode**: If live Databricks credentials are not configured, the backend falls back to a mock simulation mode with active run state transitions to demonstrate the dashboard features out-of-the-box.

---

## 🏗️ Architecture & Codebase Structure

The project is split into separate backend and frontend services:

*   **Backend**: Python, FastAPI, SQLite, and the official `databricks-sdk`.
*   **Frontend**: Modern React SPA scaffolded with Vite.

```text
pipeline_monitor/
├── backend/
│   ├── src/
│   │   ├── app.py             # FastAPI REST endpoints & simulator
│   │   ├── database.py        # SQLite schema & CRUD
│   │   ├── data_generator.py  # Mock telemetry database seeder
│   │   └── collectors/        # Metadata collector implementations
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env                   # Backend environment configuration
├── frontend/
│   ├── src/                   # React components & styles
│   ├── package.json
│   ├── Dockerfile
│   └── vite.config.js
├── docker-compose.yml         # Orchestrates backend and frontend
└── README.md
```

---

## ⚙️ Setup & Installation

### Method 1: Docker Compose (Recommended)

The easiest way to run the application is using Docker.

1. Ensure you have **Docker** and **Docker Compose** installed.
2. Clone the repository and navigate to the project root.
3. Configure your environment variables if needed (e.g., database path) by creating a `.env` file in the `backend/` directory.
4. Run the services:
   ```bash
   docker-compose up --build
   ```
5. Open your web browser:
   * **Frontend Dashboard**: [http://localhost/](http://localhost/)
   * **Backend API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

### Method 2: Manual Local Setup

#### Backend Setup

1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment (optional but recommended), then install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. (Optional) Pre-populate mock data:
   ```bash
   python -m src.data_generator --days 5
   ```
4. Start the backend FastAPI server:
   ```bash
   uvicorn src.app:app --reload --port 8000
   ```

#### Frontend Setup

1. Open a new terminal and navigate to the `frontend/` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
4. Access the dashboard at the URL provided by Vite (usually [http://localhost:5173/](http://localhost:5173/)).

---

## ⚙️ Configuration & Environment Variables

You can configure the application using a local `.env` file inside the `backend/` directory.

To get started:
```bash
cd backend
cp .env.example .env
```

### Supported Configuration Keys

| Variable | Description | Default | Required for Live Mode? |
| :--- | :--- | :--- | :--- |
| `PIPELINE_MONITOR_DB` | Path to the SQLite local database file. | `pipeline_monitor.db` | No |

---

## 🔗 Connecting to Live Databricks

The Databricks Collector relies on the official `databricks-sdk`. To connect it to your live Databricks environment:

### 1. Generating a Databricks Personal Access Token (PAT)
1. Log in to your Databricks workspace.
2. In the top right corner, click your user name and select **User Settings**.
3. Go to the **Developer** tab.
4. Next to **Access tokens**, click **Manage**.
5. Click **Generate new token**.
6. (Optional) Enter a comment and set a lifetime.
7. Click **Generate** and **copy the token value immediately**.

> **Token Permission Requirements:**
> * **Workspace Access**: The token inherits the permissions of the User or Service Principal that generated it.
> * **Job-Level Access**: The token owner must have at least **`CAN VIEW`** permissions on the Databricks Jobs/Workflows you want to monitor.

### 2. Configuring the Application
Open the web dashboard and click on **Configure** next to the Databricks connection status in the navigation bar. 
Enter your **Databricks Host URL** and **Databricks Token** in the configuration modal and click save.

*Note: Once saved, the application will securely store these credentials and automatically disable the background telemetry simulation loop, switching to fetch live metadata from the Databricks Jobs API.*

### 3. Alternative Authentication Methods (SDK Unified Auth)
The collector also supports standard ambient authentication through the official Databricks SDK WorkspaceClient:
*   **Databricks CLI Config Profile**: Setting `DATABRICKS_CONFIG_PROFILE` if your configurations are saved in `~/.databrickscfg`.
*   **Azure/AWS Native Auth**: The SDK can automatically resolve credentials using active Azure CLI sessions or AWS environment credentials.
