import { useState, useEffect, useRef } from 'react'
import Chart from 'chart.js/auto'
import './App.css'

function App() {
  const [view, setView] = useState('landing') // 'landing' or 'dashboard'
  
  // Dashboard Telemetry States
  const [kpis, setKpis] = useState(null)
  const [succeededRuns, setSucceededRuns] = useState([])
  const [failedRuns, setFailedRuns] = useState([])
  const [anomalies, setAnomalies] = useState([])
  
  // Drill-down History States
  const [selectedJobId, setSelectedJobId] = useState(null)
  const [selectedJobName, setSelectedJobName] = useState(null)
  const [selectedJobSource, setSelectedJobSource] = useState(null)
  const [jobRuns, setJobRuns] = useState([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [selectedRun, setSelectedRun] = useState(null)
  const canvasRef = useRef(null)
  const chartInstanceRef = useRef(null)
  const inlineCanvasRef = useRef(null)
  const inlineChartInstanceRef = useRef(null)

  // Modal State
  const [isChartModalOpen, setIsChartModalOpen] = useState(false)

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false)

  // Landing page mock pipeline simulation
  const [pipelineSteps, setPipelineSteps] = useState([
    { name: 'dbx_ingestion_users', status: 'SUCCESS', type: 'Ingest', duration: '42s', rows: '34,250' },
    { name: 'dwh_transform_sales', status: 'RUNNING', type: 'Transform', duration: '120s', rows: '890,120' },
    { name: 'dwh_agg_finance', status: 'PENDING', type: 'Aggregate', duration: '--', rows: '--' },
    { name: 'ml_churn_prediction', status: 'FAILED', type: 'ML Inference', duration: '15s', rows: '0', error: 'OutOfMemoryError: Spark Executor Lost' }
  ])

  // Simulator for landing page
  useEffect(() => {
    if (view !== 'landing') return
    const interval = setInterval(() => {
      setPipelineSteps(prevSteps => {
        return prevSteps.map(step => {
          if (step.status === 'RUNNING') {
            if (Math.random() < 0.3) {
              const isSuccess = Math.random() < 0.9
              return {
                ...step,
                status: isSuccess ? 'SUCCESS' : 'FAILED',
                duration: '185s',
                rows: '1,048,576',
                error: isSuccess ? null : 'AnalysisException: Table sales_events not found'
              }
            }
          } else if (step.status === 'SUCCESS' || step.status === 'FAILED') {
            if (Math.random() < 0.2) {
              return {
                ...step,
                status: 'RUNNING',
                duration: 'running...',
                rows: 'calculating...',
                error: null
              }
            }
          } else if (step.status === 'PENDING') {
            if (Math.random() < 0.2) {
              return {
                ...step,
                status: 'RUNNING',
                duration: '0s',
                rows: '0'
              }
            }
          }
          return step
        })
      })
    }, 4000)
    return () => clearInterval(interval)
  }, [view])

  // Fetch telemetry from local FastAPI server
  const fetchDashboardData = async () => {
    try {
      const kpisRes = await fetch('/api/kpis')
      if (kpisRes.ok) {
        const kpisData = await kpisRes.json()
        setKpis(kpisData)
      }

      const succRes = await fetch('/api/runs?status=SUCCESS&limit=15')
      if (succRes.ok) {
        const succData = await succRes.json()
        setSucceededRuns(succData)
      }

      const failRes = await fetch('/api/runs?status=FAILED&limit=15')
      if (failRes.ok) {
        const failData = await failRes.json()
        setFailedRuns(failData)
      }

      const anomaliesRes = await fetch('/api/anomalies')
      if (anomaliesRes.ok) {
        const anomaliesData = await anomaliesRes.json()
        setAnomalies(anomaliesData)
      }
    } catch (err) {
      console.error('Error fetching dashboard telemetry:', err)
    }
  }

  // Poll dashboard data every 5 seconds when dashboard view is active
  useEffect(() => {
    if (view === 'dashboard') {
      fetchDashboardData()
      const interval = setInterval(fetchDashboardData, 5000)
      return () => clearInterval(interval)
    }
  }, [view])

  // Fetch specific job run history
  const fetchJobHistory = async (jobId, jobName, jobSource) => {
    setIsLoadingHistory(true)
    setSelectedJobId(jobId)
    setSelectedJobName(jobName)
    setSelectedJobSource(jobSource)
    try {
      const res = await fetch(`/api/runs?job_id=${jobId}&limit=20`)
      if (res.ok) {
        const data = await res.json()
        setJobRuns(data)
      }
    } catch (err) {
      console.error('Error fetching job history:', err)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  // Handle click on specific job (instant modal feedback)
  const handleJobClick = (jobId, jobName, jobSource) => {
    setIsChartModalOpen(true)
    setSelectedRun(null)
    fetchJobHistory(jobId, jobName, jobSource)
  }

  // Sync Databricks API
  const handleSync = async () => {
    setIsSyncing(true)
    try {
      const res = await fetch('/api/collect', { method: 'POST' })
      if (res.ok) {
        await fetchDashboardData()
        if (selectedJobId) {
          fetchJobHistory(selectedJobId, selectedJobName, selectedJobSource)
        }
      }
    } catch (err) {
      console.error('Error syncing metadata:', err)
    } finally {
      setIsSyncing(false)
    }
  }

  const formatVolume = (num) => {
    if (!num) return '0'
    if (num >= 1.0e9) return (num / 1.0e9).toFixed(1) + 'B'
    if (num >= 1.0e6) return (num / 1.0e6).toFixed(1) + 'M'
    if (num >= 1.0e3) return (num / 1.0e3).toFixed(1) + 'K'
    return num.toString()
  }

  const formatDate = (isoString) => {
    const date = new Date(isoString)
    return date.toLocaleString()
  }

  // Helper to format short Run ID
  const getShortRunId = (runId) => {
    if (!runId) return ''
    if (runId.length <= 15) return runId
    return runId.substring(0, 12) + '...'
  }

  // Initialize Chart.js graph inside useEffect to prevent canvas leak & layout thrashing
  useEffect(() => {
    if (!isChartModalOpen || !canvasRef.current || jobRuns.length === 0) {
      return
    }

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy()
    }

    const ctx = canvasRef.current.getContext('2d')
    const chronRuns = [...jobRuns].reverse()
    const labels = chronRuns.map((_, i) => `Run ${chronRuns.length - i}`)
    const data = chronRuns.map(r => r.duration)
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 200)
    gradient.addColorStop(0, 'rgba(14, 165, 233, 0.45)')
    gradient.addColorStop(1, 'rgba(14, 165, 233, 0.00)')

    const pointColors = chronRuns.map(r => r.status === 'SUCCESS' ? '#10b981' : '#ef4444')

    chartInstanceRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Duration (s)',
          data: data,
          borderColor: '#0ea5e9',
          borderWidth: 2.5,
          backgroundColor: gradient,
          fill: true,
          tension: 0.25,
          pointBackgroundColor: pointColors,
          pointBorderColor: '#0a0e1a',
          pointBorderWidth: 1.5,
          pointRadius: 5,
          pointHoverRadius: 7.5,
          pointHoverBackgroundColor: pointColors,
          pointHoverBorderColor: '#ffffff',
          pointHoverBorderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (event, activeElements) => {
          if (activeElements && activeElements.length > 0) {
            const index = activeElements[0].index
            const run = chronRuns[index]
            setSelectedRun(run)
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(10, 14, 26, 0.95)',
            titleColor: '#ffffff',
            bodyColor: '#94a3b8',
            borderColor: 'rgba(255, 255, 255, 0.08)',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            displayColors: false,
            callbacks: {
              title: (context) => {
                const index = context[0].dataIndex
                const run = chronRuns[index]
                return `Run ID: ${run.id.substring(0, 12)}...`
              },
              label: (context) => {
                const index = context.dataIndex
                const run = chronRuns[index]
                const dateStr = new Date(run.start_time).toLocaleString()
                return [
                  `Status: ${run.status}`,
                  `Duration: ${run.duration.toFixed(2)}s`,
                  `Volume: ${(run.rows_read + run.rows_written).toLocaleString()} rows`,
                  `Start Time: ${dateStr}`
                ]
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: 'rgba(255, 255, 255, 0.05)',
            },
            ticks: {
              color: '#64748b',
              font: {
                family: 'Inter',
                size: 9
              }
            }
          },
          y: {
            grid: {
              color: 'rgba(255, 255, 255, 0.05)',
            },
            ticks: {
              color: '#64748b',
              font: {
                family: 'Inter',
                size: 9
              },
              callback: (value) => `${value}s`
            }
          }
        }
      }
    })

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy()
        chartInstanceRef.current = null
      }
    }
  }, [jobRuns, isChartModalOpen])

  // Render Canvas element for Chart.js
  const renderLineChart = () => {
    if (jobRuns.length === 0) {
      return <div className="no-data">No history recorded for this job.</div>
    }
    return (
      <div className="chart-canvas-container" style={{ position: 'relative', height: '360px', width: '100%', marginBottom: '1rem' }}>
        <canvas ref={canvasRef}></canvas>
      </div>
    )
  }

  // Initialize inline Chart.js graph inside useEffect
  useEffect(() => {
    if (!selectedJobId || !inlineCanvasRef.current || jobRuns.length === 0) {
      return
    }

    if (inlineChartInstanceRef.current) {
      inlineChartInstanceRef.current.destroy()
    }

    const ctx = inlineCanvasRef.current.getContext('2d')
    const chronRuns = [...jobRuns].reverse()
    const labels = chronRuns.map((_, i) => `Run ${chronRuns.length - i}`)
    const data = chronRuns.map(r => r.duration)
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 200)
    gradient.addColorStop(0, 'rgba(14, 165, 233, 0.45)')
    gradient.addColorStop(1, 'rgba(14, 165, 233, 0.00)')

    const pointColors = chronRuns.map(r => r.status === 'SUCCESS' ? '#10b981' : '#ef4444')

    inlineChartInstanceRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Duration (s)',
          data: data,
          borderColor: '#0ea5e9',
          borderWidth: 2.5,
          backgroundColor: gradient,
          fill: true,
          tension: 0.25,
          pointBackgroundColor: pointColors,
          pointBorderColor: '#0a0e1a',
          pointBorderWidth: 1.5,
          pointRadius: 5,
          pointHoverRadius: 7.5,
          pointHoverBackgroundColor: pointColors,
          pointHoverBorderColor: '#ffffff',
          pointHoverBorderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (event, activeElements) => {
          if (activeElements && activeElements.length > 0) {
            const index = activeElements[0].index
            const run = chronRuns[index]
            setSelectedRun(run)
            setIsChartModalOpen(true)
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(10, 14, 26, 0.95)',
            titleColor: '#ffffff',
            bodyColor: '#94a3b8',
            borderColor: 'rgba(255, 255, 255, 0.08)',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            displayColors: false,
            callbacks: {
              title: (context) => {
                const index = context[0].dataIndex
                const run = chronRuns[index]
                return `Run ID: ${run.id.substring(0, 12)}...`
              },
              label: (context) => {
                const index = context.dataIndex
                const run = chronRuns[index]
                const dateStr = new Date(run.start_time).toLocaleString()
                return [
                  `Status: ${run.status}`,
                  `Duration: ${run.duration.toFixed(2)}s`,
                  `Volume: ${(run.rows_read + run.rows_written).toLocaleString()} rows`,
                  `Start Time: ${dateStr}`
                ]
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: 'rgba(255, 255, 255, 0.05)',
            },
            ticks: {
              color: '#64748b',
              font: {
                family: 'Inter',
                size: 9
              }
            }
          },
          y: {
            grid: {
              color: 'rgba(255, 255, 255, 0.05)',
            },
            ticks: {
              color: '#64748b',
              font: {
                family: 'Inter',
                size: 9
              },
              callback: (value) => `${value}s`
            }
          }
        }
      }
    })

    return () => {
      if (inlineChartInstanceRef.current) {
        inlineChartInstanceRef.current.destroy()
        inlineChartInstanceRef.current = null
      }
    }
  }, [jobRuns, selectedJobId])

  // Render inline Canvas element for Chart.js
  const renderInlineLineChart = () => {
    if (jobRuns.length === 0) {
      return <div className="no-data">No history recorded for this job.</div>
    }
    return (
      <div className="chart-canvas-container" style={{ position: 'relative', height: '240px', width: '100%' }}>
        <canvas ref={inlineCanvasRef}></canvas>
      </div>
    )
  }

  return (
    <div className="landing-layout">
      {/* Navbar */}
      <nav className="navbar">
        <div className="logo-area" onClick={() => setView('landing')} style={{ cursor: 'pointer' }}>
          <div className="logo-glow"></div>
          <svg className="logo-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
          <span className="logo-text">Pipewatch</span>
        </div>
        <div className="nav-links">
          {view === 'landing' ? (
            <>
              <a href="#demo" className="nav-link">Live Telemetry</a>
              <button className="btn btn-primary" onClick={() => setView('dashboard')}>Launch Dashboard</button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={() => setView('landing')}>Home</button>
              <button className="btn btn-primary" onClick={handleSync} disabled={isSyncing}>
                {isSyncing ? (
                  <>
                    <span className="inline-spinner"></span>
                    Syncing...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    Sync Telemetry
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </nav>

      {/* VIEW 1: LANDING PAGE */}
      {view === 'landing' && (
        <>
          {/* Hero Section */}
          <header className="hero-section">
            <div className="hero-content">
              <div className="badge-wrapper">
                <span className="badge-new">v1.0.0</span>
                <span className="badge-desc">Cross-Platform Pipeline Monitoring</span>
              </div>
              <h1 className="hero-title">
                Observe Your Pipelines with <span className="gradient-text">Pipewatch</span>
              </h1>
              <p className="hero-subtitle">
                A lightweight, extensible metadata collection engine and dashboard for modern data environments. Monitor Databricks, Snowflake, and BigQuery execution logs in a single unified command center.
              </p>
              <div className="cta-group">
                <button className="btn btn-primary" onClick={() => setView('dashboard')}>Open Dashboard</button>
                <a href="#demo" className="btn btn-secondary">Interactive Demo</a>
              </div>
            </div>
          </header>

          {/* Interactive Telemetry Section */}
          <section id="demo" className="telemetry-section">
            <div className="section-header">
              <h2 className="section-title">Active Ingestion Pipeline Status</h2>
              <p className="section-desc">Simulated real-time status transitions. React updates state dynamically to reflect pipeline telemetry logs.</p>
            </div>

            <div className="telemetry-grid">
              {pipelineSteps.map((step, index) => {
                const statusClass = step.status.toLowerCase()
                return (
                  <div key={index} className={`telemetry-card ${statusClass}`}>
                    <div className="card-top">
                      <span className="step-type">{step.type}</span>
                      <span className={`status-dot-badge ${statusClass}`}>
                        <span className="dot"></span>
                        {step.status}
                      </span>
                    </div>
                    <h3 className="step-name">
                      {step.name}
                      <span className="inline-source-badge databricks">databricks</span>
                    </h3>
                    
                    <div className="card-metrics">
                      <div className="metric-box">
                        <span className="metric-label">Duration</span>
                        <span className="metric-value">{step.duration}</span>
                      </div>
                      <div className="metric-box">
                        <span className="metric-label">Rows</span>
                        <span className="metric-value">{step.rows}</span>
                      </div>
                    </div>

                    {step.error && (
                      <div className="error-box">
                        <span className="error-title">Stacktrace / Message</span>
                        <p className="error-text">{step.error}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          <footer className="footer">
            <p>&copy; {new Date().getFullYear()} Pipewatch. Built for scale.</p>
          </footer>
        </>
      )}

      {/* VIEW 2: REACT TELEMETRY DASHBOARD */}
      {view === 'dashboard' && (
        <main className="dashboard-layout">
          {/* Main Dashboard Layout Grid (12 Columns) */}
          <div className="dashboard-layout-grid">
            
            {/* Section 1: KPI Grid (2x2 Square in Top Left Corner: column 1 to 5) */}
            <div 
              className="dashboard-sidebar-kpi"
              style={{
                gridColumn: '1 / 5'
              }}
            >
              <div className="card kpi-card" style={{ height: '350px' }}>
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
                <div className="table-card-header">
                  <h3>Succeeded Executions</h3>
                  <span className="badge badge-success">{succeededRuns.length} Latest</span>
                </div>
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Pipeline</th>
                        <th>Source</th>
                        <th>Run ID</th>
                        <th>Duration</th>
                        <th>Volume</th>
                        <th>Start Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {succeededRuns.length === 0 ? (
                        <tr><td colSpan="6" className="empty-row">No succeeded runs found</td></tr>
                      ) : (
                        succeededRuns.map(run => (
                          <tr 
                            key={run.id} 
                            className="clickable-row" 
                            onClick={() => handleJobClick(run.job_id, run.job_name, run.source)}
                            title="Click to view history and graph"
                          >
                            <td className="bold text-white">{run.job_name}</td>
                            <td>
                              <span className={`source-badge ${run.source}`}>{run.source}</span>
                            </td>
                            <td className="mono">{getShortRunId(run.id)}</td>
                            <td className="bold">{run.duration.toFixed(1)}s</td>
                            <td>{formatVolume(run.rows_read + run.rows_written)}</td>
                            <td className="date-time">{run.start_time ? formatDate(run.start_time) : '--'}</td>
                          </tr>
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
                <div className="table-card-header">
                  <h3>Failed Executions</h3>
                  <span className="badge badge-failed">{failedRuns.length} Latest</span>
                </div>
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Pipeline</th>
                        <th>Source</th>
                        <th>Run ID</th>
                        <th>Duration</th>
                        <th>Error Details</th>
                        <th>Start Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failedRuns.length === 0 ? (
                        <tr><td colSpan="6" className="empty-row">No failed runs found</td></tr>
                      ) : (
                        failedRuns.map(run => (
                          <tr 
                            key={run.id} 
                            className="clickable-row" 
                            onClick={() => handleJobClick(run.job_id, run.job_name, run.source)}
                            title="Click to view history and graph"
                          >
                            <td className="bold text-white">{run.job_name}</td>
                            <td>
                              <span className={`source-badge ${run.source}`}>{run.source}</span>
                            </td>
                            <td className="mono">{getShortRunId(run.id)}</td>
                            <td className="bold">{run.duration.toFixed(1)}s</td>
                            <td>
                              <div className="truncate-error" title={run.error_message}>
                                {run.error_message || 'Execution Failure'}
                              </div>
                            </td>
                            <td className="date-time">{formatDate(run.start_time)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Section 5: Inline Debug Graph (Below Tables) */}
            {selectedJobId && (
              <div className="dashboard-content-main" style={{ gridColumn: '1 / 13', marginTop: '1.5rem' }}>
                <div className="card table-card" style={{ padding: '1.5rem' }}>
                  <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <div>
                      <span className="panel-subtitle">Inline Diagnostics Graph</span>
                      <h2>
                        {selectedJobName}
                        <span className={`source-badge ${selectedJobSource}`}>{selectedJobSource}</span>
                      </h2>
                    </div>
                    <button className="close-btn" style={{ background: 'none', border: 'none', color: 'var(--text-gray)', fontSize: '1.5rem', cursor: 'pointer' }} onClick={() => { setSelectedJobId(null); setSelectedRun(null); }}>&times;</button>
                  </div>
                  <div className="panel-body">
                    {renderInlineLineChart()}
                  </div>
                </div>
              </div>
            )}

          </div>
        </main>
      )}

      {/* Pop-Up Modal Window for the Chart Graph & Run Logs */}
      <div 
        className={`modal-backdrop ${isChartModalOpen ? 'active' : ''}`} 
        onClick={() => { setIsChartModalOpen(false); }}
      >
        <div className="modal-container" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div>
              <span className="modal-subtitle">Pipeline Drill-Down Logs & Telemetry</span>
              <h3>
                {selectedJobName || 'Loading Pipeline...'}
                {selectedJobSource && (
                  <span className={`source-badge ${selectedJobSource}`}>{selectedJobSource}</span>
                )}
              </h3>
            </div>
            <button className="modal-close-btn" onClick={() => { setIsChartModalOpen(false); }}>&times;</button>
          </div>
          <div className="modal-body font-adjusted" style={{ position: 'relative', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
            
            {/* Loading Overlay */}
            {isLoadingHistory && (
              <div className="panel-loading-overlay" style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(10, 14, 26, 0.75)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
                borderRadius: '12px',
                backdropFilter: 'blur(4px)'
              }}>
                <div className="sync-spinner"></div>
                <span style={{ marginTop: '10px', color: 'var(--text-white)', fontWeight: 500 }}>Fetching execution history...</span>
              </div>
            )}

            <p className="modal-description" style={{ marginBottom: '0.5rem' }}>
              Visualizing run durations (Y-axis) chronologically across executions (X-axis). Hover over dots to view exact timestamps.
            </p>
            <div className="line-chart-container">
              {renderLineChart()}
            </div>
            
            {selectedRun ? (
              <div className="selected-run-detail-card animate-slide-down" style={{ marginTop: '1.5rem', padding: '1.25rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px' }}>
                <h4 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-white)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                  Run Execution Details
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '2px' }}>Run ID</div>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-white)' }} title={selectedRun.id}>{selectedRun.id}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '2px' }}>Status</div>
                    <div>
                      <span className={`badge ${selectedRun.status === 'SUCCESS' ? 'badge-success' : 'badge-failed'}`} style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
                        {selectedRun.status}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '2px' }}>Duration</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-white)' }}>{selectedRun.duration.toFixed(2)}s</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '2px' }}>Data Volume</div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-white)' }}>
                      {Number(selectedRun.runs_read !== undefined ? selectedRun.runs_read : (selectedRun.rows_read !== undefined ? selectedRun.rows_read : 0)).toLocaleString()} rows read / {Number(selectedRun.runs_written !== undefined ? selectedRun.runs_written : (selectedRun.rows_written !== undefined ? selectedRun.rows_written : 0)).toLocaleString()} rows written
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '2px' }}>Start Time</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-white)' }}>{formatDate(selectedRun.start_time)}</div>
                  </div>
                  {selectedRun.end_time && (
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '2px' }}>End Time</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-white)' }}>{formatDate(selectedRun.end_time)}</div>
                    </div>
                  )}
                </div>
                {selectedRun.status === 'FAILED' && (
                  <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', color: '#f87171', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>Error Message</div>
                    <div style={{ fontSize: '0.85rem', color: '#fca5a5', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                      {selectedRun.error_message || 'Execution failed with an unclassified internal error.'}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginTop: '1.5rem', padding: '1.5rem', background: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '8px' }}>
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="15" y1="9" x2="9" y2="15"></line>
                  <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
                Click on any run point (dot) in the graph above to view its detailed execution metrics and error logs.
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}

export default App
