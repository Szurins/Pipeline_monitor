import { memo, useState, useEffect, useRef } from 'react'

const Navbar = memo(({ view, isSyncing, onNavigate, username, onLogout, onOpenConfig, config, onUnlinkConfig }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false)
  const dropdownRef = useRef(null)

  const isDatabricksConfigured = config && (config.databricks_host || config.databricks_token);

  // Close dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [])

  // Reset confirmation state when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setShowUnlinkConfirm(false)
    }
  }, [isOpen])

  return (
    <nav className="navbar">
      <div className="logo-area" onClick={() => onNavigate('/')} style={{ cursor: 'pointer' }}>
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
            {username ? (
              <button className="btn btn-primary" onClick={() => onNavigate('/dashboard')}>Dashboard</button>
            ) : (
              <button className="btn btn-primary" onClick={() => onNavigate('/login')}>Sign In</button>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {isSyncing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-gray)', fontSize: '0.85rem' }}>
                <span className="inline-spinner"></span>
                Syncing...
              </div>
            )}
            {username && (
              <>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-gray)' }}>
                  User: <span style={{ color: 'var(--c-running)', fontWeight: '600' }}>{username}</span>
                </span>
                
                {/* Tools Dropdown */}
                <div className="tools-dropdown-wrapper" ref={dropdownRef}>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => setIsOpen(!isOpen)} 
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px' }}
                  >
                    🛠️ Tools 
                    <span style={{ fontSize: '0.6rem', transition: 'transform 0.2s', display: 'inline-block', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                  </button>

                  {isOpen && (
                    <div className="tools-dropdown animate-slide-down">
                      <div className="tools-dropdown-header">Active Integrations</div>
                      
                      <div className="tools-dropdown-item">
                        <div className="tools-dropdown-item-meta">
                          <span style={{ fontWeight: '600', color: 'var(--text-white)', fontSize: '0.82rem' }}>🧱 Databricks Jobs</span>
                          <span style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
                            <span className={`tools-status-dot ${isDatabricksConfigured ? 'connected' : 'disconnected'}`}></span>
                            {isDatabricksConfigured ? 'Connected' : 'Not Connected'}
                          </span>
                        </div>

                        {showUnlinkConfirm ? (
                          <div style={{ marginTop: '6px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '6px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ fontSize: '0.72rem', color: '#fca5a5', lineHeight: '1.3' }}>
                              Are you sure you want to unlink? Sync data will be deleted.
                            </div>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                              <button 
                                className="btn btn-secondary" 
                                style={{ fontSize: '0.65rem', padding: '2px 6px', minWidth: 'unset', height: 'auto' }}
                                onClick={() => setShowUnlinkConfirm(false)}
                              >
                                Cancel
                              </button>
                              <button 
                                className="btn btn-primary" 
                                style={{ fontSize: '0.65rem', padding: '2px 6px', minWidth: 'unset', height: 'auto', background: '#ef4444', borderColor: '#ef4444' }}
                                onClick={() => {
                                  setIsOpen(false)
                                  onUnlinkConfig()
                                }}
                              >
                                Unlink
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="tools-dropdown-actions">
                            <button 
                              className="btn btn-secondary" 
                              style={{ fontSize: '0.72rem', padding: '3px 8px', minWidth: 'unset', height: 'auto', lineHeight: 'normal' }}
                              onClick={() => {
                                setIsOpen(false)
                                onOpenConfig()
                              }}
                            >
                              {isDatabricksConfigured ? 'Edit' : 'Configure'}
                            </button>
                            {isDatabricksConfigured && (
                              <button 
                                className="btn btn-secondary" 
                                style={{ fontSize: '0.72rem', padding: '3px 8px', minWidth: 'unset', height: 'auto', lineHeight: 'normal', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                                onClick={() => setShowUnlinkConfirm(true)}
                              >
                                Unlink
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="tools-dropdown-header" style={{ marginTop: '6px' }}>Planned Integrations</div>
                      
                      <div className="tools-dropdown-item" style={{ opacity: 0.5 }}>
                        <div className="tools-dropdown-item-meta">
                          <span style={{ fontWeight: '500', color: 'var(--text-white)', fontSize: '0.78rem' }}>🌪️ Apache Airflow</span>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Coming Soon</span>
                        </div>
                      </div>

                      <div className="tools-dropdown-item" style={{ opacity: 0.5 }}>
                        <div className="tools-dropdown-item-meta">
                          <span style={{ fontWeight: '500', color: 'var(--text-white)', fontSize: '0.78rem' }}>❄️ Snowflake Tasks</span>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Coming Soon</span>
                        </div>
                      </div>

                      <div className="tools-dropdown-item" style={{ opacity: 0.5 }}>
                        <div className="tools-dropdown-item-meta">
                          <span style={{ fontWeight: '500', color: 'var(--text-white)', fontSize: '0.78rem' }}>📊 dbt Cloud</span>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Coming Soon</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
            <button className="btn btn-secondary" onClick={() => onNavigate('/')}>Home</button>
            {username ? (
              <button className="btn btn-secondary" onClick={onLogout}>Sign Out</button>
            ) : (
              <button className="btn btn-primary" onClick={() => onNavigate('/login')}>Sign In</button>
            )}
          </div>
        )}
      </div>
    </nav>
  )
})

Navbar.displayName = 'Navbar'

export default Navbar
