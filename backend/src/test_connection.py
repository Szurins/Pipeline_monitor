import os
import sys
from dotenv import load_dotenv

# Ensure the root folder is on Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.collectors.databricks import DatabricksCollector

def test_credentials():
    print("==================================================")
    print("     Databricks Connection Diagnostic Tool        ")
    print("==================================================")
    
    # 1. Load env file
    print("Loading configuration from '.env' file...")
    load_dotenv()
    
    db_path = os.environ.get("PIPELINE_MONITOR_DB", "pipeline_monitor.db")
    host = os.environ.get("DATABRICKS_HOST")
    token = os.environ.get("DATABRICKS_TOKEN")
    
    print(f"  * SQLite Database Path: {db_path}")
    print(f"  * Databricks Workspace Host: {host or '[Not Set]'}")
    
    if token:
        # Mask the token for safety
        masked = token[:6] + "..." + token[-4:] if len(token) > 10 else "***"
        print(f"  * Databricks Access Token: {masked}")
    else:
        print("  * Databricks Access Token: [Not Set]")
        
    print("\nAttempting connection verification...")
    
    # 2. Instantiate and verify
    collector = DatabricksCollector(host=host, token=token)
    success, message = collector.verify_connection()
    
    if success:
        print("\n✅ CONNECTION VERIFIED SUCCESSFULLY!")
        print(f"Result: {message}")
        print("==================================================")
        
        # Discover jobs count as a secondary confirmation
        try:
            print("\nScanning for active pipelines...")
            jobs = collector.discover_jobs()
            print(f"Found {len(jobs)} configured jobs in your Databricks workspace:")
            for j in jobs[:10]:
                print(f"  - {j.name} (ID: {j.id})")
            if len(jobs) > 10:
                print(f"  - ... and {len(jobs) - 10} more jobs.")
        except Exception as e:
            print(f"⚠️  Failed to list jobs: {e}")
            
    else:
        print("\n❌ CONNECTION FAILED!")
        print(f"Reason: {message}")
        print("\nTroubleshooting Tips:")
        print("1. Ensure your host URL matches 'https://adb-xxx.y.azuredatabricks.net' format.")
        print("2. Verify your Personal Access Token is active and hasn't expired.")
        print("3. Check if your workspace requires VPN, proxy, or IP access list rules.")
        print("==================================================")
        sys.exit(1)

if __name__ == "__main__":
    test_credentials()
