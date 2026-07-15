import { useState, useEffect, useRef, memo } from 'react'
import { createPortal } from 'react-dom'

const ConfigModal = memo(({ isOpen, onClose, onSaveSuccess }) => {
  const dialogRef = useRef(null)
  const [host, setHost] = useState('')
  const [token, setToken] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })
  const [confirmData, setConfirmData] = useState(null) // null or { email: '...' }

  // Watch isOpen to call native showModal() / close()
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen) {
      setMsg({ type: '', text: '' })
      setConfirmData(null)
      // Fetch current config
      const activeToken = localStorage.getItem('token')
      if (activeToken) {
        fetch('/api/config', {
          headers: { 'Authorization': `Bearer ${activeToken}` }
        })
          .then(res => {
            if (res.ok) return res.json()
          })
          .then(data => {
            if (data) {
              setHost(data.databricks_host || '')
              setToken(data.databricks_token || '')
            }
          })
          .catch(err => console.error('Error fetching config:', err))
      }

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

  const handleBackdropClick = (e) => {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  const handleFormSubmit = async (e) => {
    e.preventDefault()
    setMsg({ type: '', text: '' })
    setConfirmData(null)
    setIsTesting(true)
    const activeToken = localStorage.getItem('token')
    
    try {
      const res = await fetch('/api/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({ databricks_host: host, databricks_token: token })
      })
      const data = await res.json()
      if (res.ok && data.status === 'success') {
        const authenticatedUser = data.message.split('Authenticated as: ')[1] || 'Unknown User'
        setConfirmData({ email: authenticatedUser })
      } else {
        setMsg({ type: 'error', text: data.message || 'Failed to verify connection.' })
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Error occurred while testing connection.' })
    } finally {
      setIsTesting(false)
    }
  }

  const handleConfirmSave = async () => {
    setMsg({ type: '', text: '' })
    setIsSaving(true)
    const activeToken = localStorage.getItem('token')

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({ databricks_host: host, databricks_token: token })
      })
      const data = await res.json()
      if (res.ok) {
        setMsg({ type: 'success', text: 'Configuration saved successfully!' })
        setConfirmData(null)
        if (onSaveSuccess) {
          onSaveSuccess({ databricks_host: host })
        }
        setTimeout(() => {
          onClose()
        }, 1200)
      } else {
        setMsg({ type: 'error', text: data.detail || 'Failed to save configuration.' })
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Error occurred while saving.' })
    } finally {
      setIsSaving(false)
    }
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className="native-modal"
      onClick={handleBackdropClick}
    >
      {isOpen && (
        <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px', width: '100%' }}>
          <div className="modal-header">
            <div>
              <span className="modal-subtitle">Databricks Workspace Connection</span>
              <h3>Configuration settings</h3>
            </div>
            <button className="modal-close-btn" onClick={onClose}>&times;</button>
          </div>
          <div className="modal-body" style={{ padding: '1.25rem 1.5rem' }}>
            
            {msg.text && (
              <div className={`alert-message ${msg.type === 'success' ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: '1rem', padding: '10px 14px', borderRadius: '8px', fontSize: '0.85rem' }}>
                {msg.text}
              </div>
            )}

            {/* Connection Test Success Confirmation Pop-Up / Panel */}
            {confirmData ? (
              <div className="animate-slide-down" style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '12px', padding: '1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '8px', borderRadius: '50%' }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div>
                  <h4 style={{ color: 'var(--text-white)', fontSize: '1.05rem', margin: '0 0 4px 0' }}>Connection Verified!</h4>
                  <p style={{ color: 'var(--text-gray)', fontSize: '0.85rem', margin: 0 }}>
                    Successfully authenticated as:
                  </p>
                  <div style={{ color: '#10b981', fontWeight: 'bold', fontSize: '1.05rem', marginTop: '6px', wordBreak: 'break-all' }}>
                    {confirmData.email}
                  </div>
                </div>
                <p style={{ color: 'var(--text-gray)', fontSize: '0.8rem', margin: 0 }}>
                  Do you want to save this connection configuration and activate live telemetry monitoring?
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setConfirmData(null)}
                    disabled={isSaving}
                    style={{ minWidth: '100px' }}
                  >
                    Back / Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleConfirmSave}
                    disabled={isSaving}
                    style={{ minWidth: '130px', background: '#10b981', borderColor: '#10b981' }}
                  >
                    {isSaving ? 'Saving...' : 'Confirm & Save'}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleFormSubmit}>
                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label className="form-label" style={{ color: 'var(--text-white)', fontWeight: '500', marginBottom: '6px', display: 'block' }}>
                    Databricks Host URL
                  </label>
                  <input
                    type="text"
                    placeholder="https://adb-xxxx.azuredatabricks.net or adb-xxxx.azuredatabricks.net"
                    className="form-input"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    required
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-gray)', marginTop: '4px', display: 'block' }}>
                    Workspace URL (https:// will be prepended automatically if omitted)
                  </span>
                </div>

                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                  <label className="form-label" style={{ color: 'var(--text-white)', fontWeight: '500', marginBottom: '6px', display: 'block' }}>
                    Personal Access Token (PAT)
                  </label>
                  <input
                    type="password"
                    placeholder="dapi-xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="form-input"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    required
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-gray)', marginTop: '4px', display: 'block' }}>
                    Generate a Personal Access Token in User Settings &gt; Developer
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={onClose}
                    style={{ minWidth: '80px' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isTesting || !host || !token}
                    style={{ minWidth: '150px' }}
                  >
                    {isTesting ? 'Testing Connection...' : 'Save Configuration'}
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}
    </dialog>,
    document.body
  )
})

ConfigModal.displayName = 'ConfigModal'

export default ConfigModal
