import { useState, useEffect, useRef, memo } from 'react'
import { createPortal } from 'react-dom'
import Chart from 'chart.js/auto'
import { formatDate } from '../utils/helpers'

const JobDetailModal = memo(({ activeJob, onClose, syncCount, config }) => {
  const dialogRef = useRef(null)
  const [jobRuns, setJobRuns] = useState([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [selectedRun, setSelectedRun] = useState(null)
  
  const canvasRef = useRef(null)
  const chartInstanceRef = useRef(null)
  
  const isOpen = activeJob !== null

  // Watch isOpen to call native showModal() / close()
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal()
      }
    } else {
      if (dialog.open) {
        dialog.close()
      }
    }
  }, [isOpen])

  // Native dialog close event (e.g. when pressing Esc)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const handleCancel = (e) => {
      e.preventDefault()
      onClose()
    }

    dialog.addEventListener('cancel', handleCancel)
    return () => {
      dialog.removeEventListener('cancel', handleCancel)
    }
  }, [onClose])

  // Fetch job history when activeJob or syncCount changes
  useEffect(() => {
    if (!activeJob) {
      setJobRuns([])
      setSelectedRun(null)
      return
    }

    let isCurrent = true
    setIsLoadingHistory(true)
    setSelectedRun(null)

    const activeToken = localStorage.getItem('token')
    const headers = activeToken ? { 'Authorization': `Bearer ${activeToken}` } : {}

    fetch(`/api/runs?job_id=${activeJob.id}&limit=30`, { headers })
      .then(res => {
        if (res.ok) return res.json()
        throw new Error("Failed to fetch history")
      })
      .then(data => {
        if (isCurrent) {
          setJobRuns(data)
          if (data && data.length > 0) {
            // Auto-select the clicked run from the table, or default to the latest run
            const clickedRun = activeJob.targetRunId
              ? data.find(r => r.id === activeJob.targetRunId)
              : null
            setSelectedRun(clickedRun || data[0])
          }
        }
      })
      .catch(err => {
        console.error("Error fetching job history:", err)
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoadingHistory(false)
        }
      })

    return () => {
      isCurrent = false
    }
  }, [activeJob, syncCount])

  const handleBackdropClick = (e) => {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  const chronRunsRef = useRef([])
  chronRunsRef.current = [...jobRuns].reverse()

  // Chart.js initialization
  useEffect(() => {
    if (!isOpen || !activeJob || !canvasRef.current || jobRuns.length === 0) {
      return
    }

    const ctx = canvasRef.current.getContext('2d')
    const chronRuns = chronRunsRef.current
    const labels = chronRuns.map((_, i) => `Run ${chronRuns.length - i}`)
    const data = chronRuns.map(r => r.duration)
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 200)
    gradient.addColorStop(0, 'rgba(14, 165, 233, 0.45)')
    gradient.addColorStop(1, 'rgba(14, 165, 233, 0.00)')

    const pointColors = chronRuns.map(r => r.status === 'SUCCESS' ? '#10b981' : '#ef4444')

    if (chartInstanceRef.current) {
      chartInstanceRef.current.data.labels = labels
      chartInstanceRef.current.data.datasets[0].data = data
      chartInstanceRef.current.data.datasets[0].backgroundColor = gradient
      chartInstanceRef.current.data.datasets[0].pointBackgroundColor = pointColors
      chartInstanceRef.current.data.datasets[0].pointHoverBackgroundColor = pointColors
      chartInstanceRef.current.update()
      return
    }

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
            const run = chronRunsRef.current[index]
            setSelectedRun(run)
          }
        },
        plugins: {
          legend: { display: false },
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
                const run = chronRunsRef.current[index]
                return `Run ID: ${run.id.substring(0, 12)}...`
              },
              label: (context) => {
                const index = context.dataIndex
                const run = chronRunsRef.current[index]
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
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#64748b',
              font: { family: 'Inter', size: 9 }
            }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#64748b',
              font: { family: 'Inter', size: 9 },
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
  }, [jobRuns, isOpen, activeJob])

  return createPortal(
    <dialog
      ref={dialogRef}
      className="native-modal"
      onClick={handleBackdropClick}
    >
      {isOpen && activeJob && (
        <div className="modal-container" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div>
              <span className="modal-subtitle">Pipeline Drill-Down Logs & Telemetry</span>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {activeJob.name}
                <span className={`source-badge ${activeJob.source}`}>{activeJob.source}</span>
                {activeJob.source === 'databricks' && config?.databricks_host && (
                  <a
                    href={`https://${config.databricks_host}/#job/${activeJob.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="job-external-link"
                    title="Open this specific job in Databricks Workspace"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.8rem',
                      color: 'var(--c-running)',
                      textDecoration: 'none',
                      padding: '4px 8px',
                      background: 'rgba(14, 165, 233, 0.1)',
                      border: '1px solid rgba(14, 165, 233, 0.25)',
                      borderRadius: '6px',
                      fontWeight: 500,
                      transition: 'all 0.2s ease-in-out'
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                      <polyline points="15 3 21 3 21 9"></polyline>
                      <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                    Open in Databricks
                  </a>
                )}
              </h3>
            </div>
            <button className="modal-close-btn" onClick={onClose}>&times;</button>
          </div>
          <div className="modal-body font-adjusted" style={{ position: 'relative', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
            
            {isLoadingHistory && (
              <div className="panel-loading-overlay" style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(10, 14, 26, 0.85)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
                borderRadius: '12px'
              }}>
                <div className="sync-spinner"></div>
                <span style={{ marginTop: '10px', color: 'var(--text-white)', fontWeight: 500 }}>Fetching execution history...</span>
              </div>
            )}

            <div className="line-chart-container" style={{ marginBottom: '1.5rem', height: 'auto', flexShrink: 0 }}>
              {jobRuns.length === 0 ? (
                <div className="no-data">No history recorded for this job.</div>
              ) : (
                <>
                  <div className="chart-canvas-container" style={{ position: 'relative', height: '260px', width: '100%', marginBottom: '1.25rem' }}>
                    <canvas ref={canvasRef}></canvas>
                  </div>
                  <h4 style={{ color: 'var(--text-white)', marginBottom: '0.75rem', fontSize: '0.95rem' }}>Recent Executions (Select to view detailed metrics)</h4>
                  <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px' }}>
                    {jobRuns.map((r, i) => (
                      <button
                        key={r.id}
                        onClick={() => setSelectedRun(r)}
                        className={`btn ${selectedRun?.id === r.id ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: '0.8rem', padding: '6px 12px', whiteSpace: 'nowrap' }}
                      >
                        Run {jobRuns.length - i} ({r.status})
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            
            {selectedRun ? (
              <div className="selected-run-detail-card animate-slide-down" style={{ marginTop: '0.5rem', padding: '1.25rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', flexGrow: 1, overflowY: 'auto' }}>
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
                      {Number(selectedRun.rows_read !== undefined ? selectedRun.rows_read : 0).toLocaleString()} rows read / {Number(selectedRun.rows_written !== undefined ? selectedRun.rows_written : 0).toLocaleString()} rows written
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
              <div style={{ marginTop: '0.5rem', padding: '1.5rem', background: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '8px' }}>
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="15" y1="9" x2="9" y2="15"></line>
                  <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
                Click on any run button in the list above to view its detailed execution metrics and error logs.
              </div>
            )}
          </div>
        </div>
      )}
    </dialog>,
    document.body
  )
})
JobDetailModal.displayName = 'JobDetailModal'

export default JobDetailModal
