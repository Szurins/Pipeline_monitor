import { memo } from 'react'
import RunRow from './RunRow'
import { formatVolume } from '../utils/helpers'

const Dashboard = memo(({
  kpis,
  anomalies,
  succeededSearch,
  setSucceededSearch,
  failedSearch,
  setFailedSearch,
  filteredSucceeded,
  filteredFailed,
  renderHeader,
  handleScroll,
  handleJobClick,
  setIsKpiModalOpen,
  config,
  onOpenConfig
}) => {
  const hasConfig = config && (config.databricks_host || config.databricks_token);

  if (!hasConfig) {
    return (
      <main className="dashboard-layout" style={{ padding: '2rem', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <div className="card table-card animate-slide-down" style={{ maxWidth: '800px', width: '100%', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--c-running)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '1rem', filter: 'drop-shadow(0 0 8px rgba(14, 165, 233, 0.4))' }}>
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
              <path d="M12 16v-4"/>
              <path d="M12 8h.01"/>
            </svg>
            <h2 style={{ color: 'var(--text-white)', fontSize: '1.6rem', marginBottom: '0.5rem' }}>No Integrations Configured</h2>
            <p style={{ color: 'var(--text-gray)', fontSize: '0.95rem' }}>
              To start tracking telemetry runs, please configure at least one data platform or scheduler below.
            </p>
          </div>

          <div className="table-responsive">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}>Platform</th>
                  <th style={{ textAlign: 'left', padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}>Type</th>
                  <th style={{ textAlign: 'left', padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}>Status</th>
                  <th style={{ textAlign: 'right', padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: '16px 12px', fontWeight: '600', color: 'var(--text-white)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.25rem' }}>🧱</span> Databricks Jobs
                  </td>
                  <td style={{ padding: '16px 12px', color: 'var(--text-gray)', fontSize: '0.85rem' }}>Data Lakehouse / Spark</td>
                  <td style={{ padding: '16px 12px' }}>
                    <span className="badge badge-failed" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>Not Connected</span>
                  </td>
                  <td style={{ padding: '16px 12px', textAlign: 'right' }}>
                    <button className="btn btn-primary" onClick={onOpenConfig} style={{ fontSize: '0.8rem', padding: '6px 14px' }}>
                      Configure Connection
                    </button>
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', opacity: 0.55 }}>
                  <td style={{ padding: '16px 12px', fontWeight: '600', color: 'var(--text-white)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.25rem' }}>🌪️</span> Apache Airflow
                  </td>
                  <td style={{ padding: '16px 12px', color: 'var(--text-gray)', fontSize: '0.85rem' }}>Workflow Orchestrator</td>
                  <td style={{ padding: '16px 12px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-gray)', border: '1px solid rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: '4px' }}>Coming Soon</span>
                  </td>
                  <td style={{ padding: '16px 12px', textAlign: 'right' }}>
                    <button className="btn btn-secondary" disabled style={{ fontSize: '0.8rem', padding: '6px 14px', cursor: 'not-allowed' }}>
                      Configure
                    </button>
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', opacity: 0.55 }}>
                  <td style={{ padding: '16px 12px', fontWeight: '600', color: 'var(--text-white)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.25rem' }}>❄️</span> Snowflake Tasks
                  </td>
                  <td style={{ padding: '16px 12px', color: 'var(--text-gray)', fontSize: '0.85rem' }}>Data Warehouse Jobs</td>
                  <td style={{ padding: '16px 12px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-gray)', border: '1px solid rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: '4px' }}>Coming Soon</span>
                  </td>
                  <td style={{ padding: '16px 12px', textAlign: 'right' }}>
                    <button className="btn btn-secondary" disabled style={{ fontSize: '0.8rem', padding: '6px 14px', cursor: 'not-allowed' }}>
                      Configure
                    </button>
                  </td>
                </tr>
                <tr style={{ opacity: 0.55 }}>
                  <td style={{ padding: '16px 12px', fontWeight: '600', color: 'var(--text-white)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.25rem' }}>📊</span> dbt Cloud
                  </td>
                  <td style={{ padding: '16px 12px', color: 'var(--text-gray)', fontSize: '0.85rem' }}>Data Transformations</td>
                  <td style={{ padding: '16px 12px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-gray)', border: '1px solid rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: '4px' }}>Coming Soon</span>
                  </td>
                  <td style={{ padding: '16px 12px', textAlign: 'right' }}>
                    <button className="btn btn-secondary" disabled style={{ fontSize: '0.8rem', padding: '6px 14px', cursor: 'not-allowed' }}>
                      Configure
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-layout">
      {/* Main Dashboard Layout Grid (12 Columns) */}
      <div className="dashboard-layout-grid">
        
        {/* Section 1: KPI Grid / Modal Trigger */}
        <div 
          className="dashboard-sidebar-kpi"
          style={{
            gridColumn: '1 / 5'
          }}
        >
          <div 
            className="card kpi-card" 
            style={{ 
              height: '350px', 
              cursor: 'pointer'
            }}
            onClick={() => setIsKpiModalOpen(true)}
            title="Click to view run status distribution breakdown"
          >
            <div className="kpi-grid">
              <div className="kpi-item border-right-divider border-bottom-divider">
                <div className="kpi-title">Total Runs</div>
                <div className="kpi-value">{kpis ? kpis.total_runs : '--'}</div>
                <div className="kpi-sub">
                  {kpis && kpis.running_runs > 0 ? (
                    <span className="badge-pulse-running">{kpis.running_runs} Active</span>
                  ) : 'All runs captured'}
                </div>
              </div>
              <div className="kpi-item border-bottom-divider">
                <div className="kpi-title">Failure Rate</div>
                <div className="kpi-value" style={{ color: '#ef4444' }}>{kpis ? `${kpis.failure_rate}%` : '--'}</div>
                <div className="kpi-sub">
                  <span style={{ color: '#ef4444', fontWeight: '600' }}>{kpis ? kpis.failed_runs : '--'}</span> failed executions
                </div>
              </div>
              <div className="kpi-item border-right-divider">
                <div className="kpi-title">Avg Duration</div>
                <div className="kpi-value">{kpis ? `${kpis.avg_duration}s` : '--'}</div>
                <div className="kpi-sub">completed average</div>
              </div>
              <div className="kpi-item">
                <div className="kpi-title">Data Volume</div>
                <div className="kpi-value">{kpis ? formatVolume(kpis.total_rows_read + kpis.total_rows_written) : '--'}</div>
                <div className="kpi-sub">rows processed</div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 1.5: Anomaly Detector (Next to KPI on Row 1: columns 5 to 13) */}
        <div 
          className="dashboard-content-main"
          style={{
            gridColumn: '5 / 13'
          }}
        >
          <div className="card table-card" style={{ height: '350px' }}>
            <div className="table-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <h3>Latency Anomaly Detector</h3>
              </div>
              <span className={`badge ${anomalies.length > 0 ? 'badge-failed' : 'badge-success'}`}>
                {anomalies.length > 0 ? `${anomalies.length} SLA Breaches` : 'All Normal'}
              </span>
            </div>
            <div className="table-responsive" style={{ flexGrow: 1, overflowY: 'auto' }}>
              {anomalies.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-gray)', padding: '1rem', textAlign: 'center' }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--c-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '12px' }}>
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  <span style={{ fontSize: '0.85rem', fontWeight: '500' }}>All pipelines running within normal historical runtime averages.</span>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Pipeline</th>
                      <th>Current Run</th>
                      <th>Average Baseline</th>
                      <th>Deviation</th>
                      <th>Rows Processed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalies.map((anom) => (
                      <tr key={anom.run_id} className="interactive-row">
                        <td className="bold text-white">{anom.job_name}</td>
                        <td className="bold" style={{ color: '#ef4444' }}>{anom.duration.toFixed(1)}s</td>
                        <td className="muted-text">{anom.avg_duration}s</td>
                        <td>
                          <span style={{ color: '#ef4444', fontWeight: '700', fontSize: '0.8rem' }}>
                            +{anom.deviation_percent}% SLA Breach
                          </span>
                        </td>
                        <td>{anom.rows_processed ? anom.rows_processed.toLocaleString() : 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Section 3: Succeeded Executions Table */}
        <div className="dashboard-content-main" style={{ gridColumn: '1 / 7' }}>
          <div className="card table-card">
            <div className="table-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3>Succeeded Executions</h3>
                <span className="badge badge-success">{filteredSucceeded.length} Latest</span>
              </div>
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Search succeeded..."
                  value={succeededSearch}
                  onChange={(e) => setSucceededSearch(e.target.value)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '8px',
                    color: 'var(--text-white)',
                    padding: '6px 32px 6px 12px',
                    fontSize: '0.85rem',
                    width: '230px',
                    outline: 'none'
                  }}
                />
                {succeededSearch && (
                  <button
                    onClick={() => setSucceededSearch('')}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-gray)',
                      cursor: 'pointer',
                      fontSize: '1.05rem',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="Clear search"
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>
            <div className="table-responsive" onScroll={(e) => handleScroll(e, 'succeeded')} style={{ maxHeight: '550px' }}>
              <table>
                <thead>
                  <tr>
                    {renderHeader('succeeded', 'job_name', 'Pipeline')}
                    {renderHeader('succeeded', 'source', 'Source')}
                    {renderHeader('succeeded', 'id', 'Run ID')}
                    {renderHeader('succeeded', 'duration', 'Duration')}
                    {renderHeader('succeeded', 'volume', 'Volume')}
                    {renderHeader('succeeded', 'start_time', 'Start Time')}
                  </tr>
                </thead>
                <tbody>
                  {filteredSucceeded.length === 0 ? (
                    <tr><td colSpan="6" className="empty-row">No succeeded runs found</td></tr>
                  ) : (
                    filteredSucceeded.map(run => (
                      <RunRow 
                        key={run.id} 
                        run={run} 
                        onClick={handleJobClick}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Section 4: Failed Executions Table */}
        <div className="dashboard-content-main" style={{ gridColumn: '7 / 13' }}>
          <div className="card table-card">
            <div className="table-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3>Failed Executions</h3>
                <span className="badge badge-failed">{filteredFailed.length} Latest</span>
              </div>
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Search failed..."
                  value={failedSearch}
                  onChange={(e) => setFailedSearch(e.target.value)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '8px',
                    color: 'var(--text-white)',
                    padding: '6px 32px 6px 12px',
                    fontSize: '0.85rem',
                    width: '230px',
                    outline: 'none'
                  }}
                />
                {failedSearch && (
                  <button
                    onClick={() => setFailedSearch('')}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-gray)',
                      cursor: 'pointer',
                      fontSize: '1.05rem',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="Clear search"
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>
            <div className="table-responsive" onScroll={(e) => handleScroll(e, 'failed')} style={{ maxHeight: '550px' }}>
              <table>
                <thead>
                  <tr>
                    {renderHeader('failed', 'job_name', 'Pipeline')}
                    {renderHeader('failed', 'source', 'Source')}
                    {renderHeader('failed', 'id', 'Run ID')}
                    {renderHeader('failed', 'duration', 'Duration')}
                    {renderHeader('failed', 'error_message', 'Error Details')}
                    {renderHeader('failed', 'start_time', 'Start Time')}
                  </tr>
                </thead>
                <tbody>
                  {filteredFailed.length === 0 ? (
                    <tr><td colSpan="6" className="empty-row">No failed runs found</td></tr>
                  ) : (
                    filteredFailed.map(run => (
                      <RunRow 
                        key={run.id} 
                        run={run} 
                        onClick={handleJobClick}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </main>
  )
})
Dashboard.displayName = 'Dashboard'

export default Dashboard
