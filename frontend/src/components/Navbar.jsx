import { memo } from 'react'

const Navbar = memo(({ view, isSyncing, onNavigate }) => {
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
            <button className="btn btn-primary" onClick={() => onNavigate('/dashboard')}>Launch Dashboard</button>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isSyncing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-gray)', fontSize: '0.85rem' }}>
                <span className="inline-spinner"></span>
                Syncing Databricks...
              </div>
            )}
            <button className="btn btn-secondary" onClick={() => onNavigate('/')}>Home</button>
          </div>
        )}
      </div>
    </nav>
  )
})
Navbar.displayName = 'Navbar'

export default Navbar
