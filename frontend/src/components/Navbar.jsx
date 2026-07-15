import { memo } from 'react'

const Navbar = memo(({ view, isSyncing, onNavigate, username, onLogout }) => {
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
              <span style={{ fontSize: '0.85rem', color: 'var(--text-gray)' }}>
                User: <span style={{ color: 'var(--c-running)', fontWeight: '600' }}>{username}</span>
              </span>
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
