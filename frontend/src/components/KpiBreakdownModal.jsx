import { useEffect, useRef, memo } from 'react'
import { createPortal } from 'react-dom'
import Chart from 'chart.js/auto'

const KpiBreakdownModal = memo(({ isOpen, onClose, kpis }) => {
  const dialogRef = useRef(null)
  const canvasRef = useRef(null)
  const chartInstanceRef = useRef(null)

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

  // Native dialog close event (e.g. Esc key press)
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

  const running = kpis?.running_runs || 0
  const failed = kpis?.failed_runs || 0
  const succeeded = kpis ? Math.max(0, kpis.total_runs - failed - running) : 0
  const total = kpis?.total_runs || 0

  useEffect(() => {
    if (!isOpen || !canvasRef.current) return

    if (chartInstanceRef.current) {
      chartInstanceRef.current.data.datasets[0].data = [succeeded, failed, running]
      chartInstanceRef.current.update()
      return
    }

    const ctx = canvasRef.current.getContext('2d')

    chartInstanceRef.current = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Succeeded', 'Failed', 'Running'],
        datasets: [{
          data: [succeeded, failed, running],
          backgroundColor: ['#10b981', '#ef4444', '#0ea5e9'],
          borderColor: '#0a0e1a',
          borderWidth: 2,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#94a3b8',
              font: { family: 'Inter', size: 11, weight: '500' }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(10, 14, 26, 0.95)',
            borderColor: 'rgba(255, 255, 255, 0.08)',
            borderWidth: 1,
            titleColor: '#ffffff',
            bodyColor: '#94a3b8',
            padding: 10,
            cornerRadius: 8
          }
        },
        cutout: '70%'
      }
    })

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy()
        chartInstanceRef.current = null
      }
    }
  }, [isOpen, succeeded, failed, running])

  const handleBackdropClick = (e) => {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  const getPercent = (val) => {
    if (!total) return '0.0%'
    return ((val / total) * 100).toFixed(1) + '%'
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className="native-modal"
      onClick={handleBackdropClick}
    >
      {isOpen && kpis && (
        <div className="modal-container modal-small" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div>
              <span className="modal-subtitle">Global Telemetry Status Distribution</span>
              <h3>Run Execution Breakdown</h3>
            </div>
            <button className="modal-close-btn" onClick={onClose}>&times;</button>
          </div>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            
            <div style={{ position: 'relative', height: '240px', width: '100%', marginBottom: '1.5rem' }}>
              <canvas ref={canvasRef}></canvas>
              <div style={{
                position: 'absolute',
                top: '46%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                pointerEvents: 'none'
              }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-white)' }}>
                  {total}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', tracking: '0.05em' }}>
                  Total Runs
                </div>
              </div>
            </div>

            <div style={{ width: '100%', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1.25rem', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Succeeded</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-white)' }}>{succeeded}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{getPercent(succeeded)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Failed</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-white)' }}>{failed}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{getPercent(failed)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#0ea5e9', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Running</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-white)' }}>{running}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{getPercent(running)}</div>
              </div>
            </div>

          </div>
        </div>
      )}
    </dialog>,
    document.body
  )
})
KpiBreakdownModal.displayName = 'KpiBreakdownModal'

export default KpiBreakdownModal
