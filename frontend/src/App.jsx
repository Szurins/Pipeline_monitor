import { useState, useEffect, useCallback, useMemo } from 'react'
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import Navbar from './components/Navbar'
import LandingPage from './components/LandingPage'
import Dashboard from './components/Dashboard'
import JobDetailModal from './components/JobDetailModal'
import KpiBreakdownModal from './components/KpiBreakdownModal'
import LoginPage from './components/LoginPage'
import './App.css'

function AppContent() {
  const navigate = useNavigate()
  const location = useLocation()
  
  // Auth States
  const [token, setToken] = useState(() => localStorage.getItem('token') || null)
  const [username, setUsername] = useState(() => localStorage.getItem('username') || null)

  // Route-based view derivation
  let view = 'landing'
  if (location.pathname === '/dashboard') {
    view = 'dashboard'
  } else if (location.pathname === '/login') {
    view = 'login'
  }
  
  // Redirect dashboard if not logged in
  useEffect(() => {
    if (view === 'dashboard' && !token) {
      navigate('/login')
    }
  }, [view, token, navigate])

  const handleLoginSuccess = (newToken, newUsername) => {
    localStorage.setItem('token', newToken)
    localStorage.setItem('username', newUsername)
    setToken(newToken)
    setUsername(newUsername)
    navigate('/dashboard')
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    setToken(null)
    setUsername(null)
    navigate('/')
  }
  
  // Dashboard Telemetry States
  const [kpis, setKpis] = useState(null)
  const [succeededRuns, setSucceededRuns] = useState([])
  const [failedRuns, setFailedRuns] = useState([])
  const [anomalies, setAnomalies] = useState([])

  // Modal Telemetry States
  const [activeJob, setActiveJob] = useState(null)
  const [syncCount, setSyncCount] = useState(0)

  // Search & Sorting States
  const [succeededSearch, setSucceededSearch] = useState('')
  const [failedSearch, setFailedSearch] = useState('')
  const [succeededSort, setSucceededSort] = useState({ column: null, direction: null })
  const [failedSort, setFailedSort] = useState({ column: null, direction: null })

  // Lazy-loading limits
  const [succeededLimit, setSucceededLimit] = useState(15)
  const [failedLimit, setFailedLimit] = useState(15)

  // KPI Breakdown Modal state
  const [isKpiModalOpen, setIsKpiModalOpen] = useState(false)

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false)

  // Config settings
  const [config, setConfig] = useState(null)

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

  // Load config on mount
  useEffect(() => {
    if (view !== 'dashboard') return
    fetch('/api/config')
      .then(res => {
        if (res.ok) return res.json()
      })
      .then(data => {
        if (data) setConfig(data)
      })
      .catch(err => console.error('Error fetching config:', err))
  }, [view])

  // Fetch telemetry from local FastAPI server
  const fetchDashboardData = useCallback(async (succLimit, failLimit) => {
    const activeToken = localStorage.getItem('token')
    if (!activeToken) return
    const headers = { 'Authorization': `Bearer ${activeToken}` }

    try {
      const kpisRes = await fetch('/api/kpis', { headers })
      if (kpisRes.ok) {
        const kpisData = await kpisRes.json()
        setKpis(kpisData)
      }

      const succRes = await fetch(`/api/runs?status=SUCCESS&limit=${succLimit}`, { headers })
      if (succRes.ok) {
        const succData = await succRes.json()
        setSucceededRuns(succData)
      }

      const failRes = await fetch(`/api/runs?status=FAILED&limit=${failLimit}`, { headers })
      if (failRes.ok) {
        const failData = await failRes.json()
        setFailedRuns(failData)
      }

      const anomaliesRes = await fetch('/api/anomalies', { headers })
      if (anomaliesRes.ok) {
        const anomaliesData = await anomaliesRes.json()
        setAnomalies(anomaliesData)
      }
    } catch (err) {
      console.error('Error fetching dashboard telemetry:', err)
    }
  }, [])

  // Automatic background sync and polling loop (runs every 30 seconds)
  useEffect(() => {
    if (view !== 'dashboard') return
    
    // Pause all background sync and polling while a modal window is open to prevent charts from flashing
    if (activeJob !== null || isKpiModalOpen) return

    // Immediately fetch initial dashboard data
    fetchDashboardData(succeededLimit, failedLimit)

    // Trigger POST /api/collect sync followed by refresh
    const performBackgroundSync = async () => {
      const activeToken = localStorage.getItem('token')
      if (!activeToken) return

      setIsSyncing(true)
      try {
        const res = await fetch('/api/collect', { 
          method: 'POST', 
          headers: { 'Authorization': `Bearer ${activeToken}` }
        })
        if (res.ok) {
          await fetchDashboardData(succeededLimit, failedLimit)
          setSyncCount(prev => prev + 1)
        }
      } catch (err) {
        console.error('Error in automatic background sync:', err)
      } finally {
        setIsSyncing(false)
      }
    }

    // Run first background sync after 2 seconds to load freshest results quickly, then every 30 seconds
    const initialSyncTimeout = setTimeout(performBackgroundSync, 2000)
    const interval = setInterval(performBackgroundSync, 30000)

    // Also set up a lightweight database poll every 5 seconds to keep UI responsive
    const dbPollInterval = setInterval(() => {
      fetchDashboardData(succeededLimit, failedLimit)
    }, 5000)

    return () => {
      clearTimeout(initialSyncTimeout)
      clearInterval(interval)
      clearInterval(dbPollInterval)
    }
  }, [view, succeededLimit, failedLimit, fetchDashboardData, activeJob, isKpiModalOpen])

  // Handle click on specific job (instant modal feedback with specific clicked run id)
  const handleJobClick = useCallback((jobId, jobName, jobSource, targetRunId) => {
    setActiveJob({ id: jobId, name: jobName, source: jobSource, targetRunId: targetRunId })
  }, [])

  // Callbacks for closing sub-panels
  const handleCloseModal = useCallback(() => {
    setActiveJob(null)
  }, [])

  // Scroll handler for lazy loading
  const handleScroll = useCallback((e, tableType) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target
    if (scrollHeight - scrollTop - clientHeight < 30) {
      if (tableType === 'succeeded') {
        setSucceededLimit(prev => prev + 15)
      } else {
        setFailedLimit(prev => prev + 15)
      }
    }
  }, [])

  // Sorting Handler
  const handleSort = useCallback((tableType, columnName) => {
    const isSucceeded = tableType === 'succeeded'
    const currentSort = isSucceeded ? succeededSort : failedSort
    const setSort = isSucceeded ? setSucceededSort : setFailedSort

    if (currentSort.column === columnName) {
      if (currentSort.direction === 'asc') {
        setSort({ column: columnName, direction: 'desc' })
      } else if (currentSort.direction === 'desc') {
        setSort({ column: null, direction: null })
      }
    } else {
      setSort({ column: columnName, direction: 'asc' })
    }
  }, [succeededSort, failedSort])

  // Memoized Sort & Filter calculations for execution feeds
  const filteredSucceeded = useMemo(() => {
    let result = [...succeededRuns]
    if (succeededSearch.trim() !== '') {
      const q = succeededSearch.toLowerCase()
      result = result.filter(r => r.job_name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q))
    }
    if (succeededSort.column) {
      const { column, direction } = succeededSort
      result.sort((a, b) => {
        let valA, valB
        if (column === 'volume') {
          valA = (a.rows_read || 0) + (a.rows_written || 0)
          valB = (b.rows_read || 0) + (b.rows_written || 0)
        } else {
          valA = a[column]
          valB = b[column]
        }

        if (valA === undefined || valA === null) return 1
        if (valB === undefined || valB === null) return -1

        if (typeof valA === 'string') {
          return direction === 'asc' 
            ? valA.localeCompare(valB) 
            : valB.localeCompare(valA)
        } else {
          return direction === 'asc' 
            ? valA - valB 
            : valB - valA
        }
      })
    }
    return result
  }, [succeededRuns, succeededSearch, succeededSort])

  const filteredFailed = useMemo(() => {
    let result = [...failedRuns]
    if (failedSearch.trim() !== '') {
      const q = failedSearch.toLowerCase()
      result = result.filter(r => r.job_name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || (r.error_message || '').toLowerCase().includes(q))
    }
    if (failedSort.column) {
      const { column, direction } = failedSort
      result.sort((a, b) => {
        let valA = a[column]
        let valB = b[column]

        if (valA === undefined || valA === null) return 1
        if (valB === undefined || valB === null) return -1

        if (typeof valA === 'string') {
          return direction === 'asc' 
            ? valA.localeCompare(valB) 
            : valB.localeCompare(valA)
        } else {
          return direction === 'asc' 
            ? valA - valB 
            : valB - valA
        }
      })
    }
    return result
  }, [failedRuns, failedSearch, failedSort])

  // Helper to render sortable column headers for raw execution feed
  const renderHeader = (tableType, columnName, label) => {
    const sort = tableType === 'succeeded' ? succeededSort : failedSort
    const isActive = sort.column === columnName
    return (
      <th 
        onClick={() => handleSort(tableType, columnName)}
        style={{ cursor: 'pointer', userSelect: 'none', color: isActive ? 'var(--c-running)' : 'inherit' }}
        title={`Sort by ${label} (Ascending -> Descending -> Reset)`}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          {label}
          <span style={{ fontSize: '0.65rem', opacity: isActive ? 1 : 0.35, display: 'inline-block', minWidth: '10px' }}>
            {isActive ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}
          </span>
        </div>
      </th>
    )
  }

  return (
    <div className="landing-layout">
      {/* Navbar */}
      <Navbar 
        view={view} 
        isSyncing={isSyncing} 
        onNavigate={navigate} 
        username={username}
        onLogout={handleLogout}
      />

      {/* VIEW 1: LANDING PAGE */}
      {view === 'landing' && (
        <LandingPage 
          pipelineSteps={pipelineSteps} 
          onNavigate={navigate} 
        />
      )}

      {/* VIEW 2: REACT TELEMETRY DASHBOARD */}
      {view === 'dashboard' && (
        <Dashboard
          kpis={kpis}
          anomalies={anomalies}
          succeededSearch={succeededSearch}
          setSucceededSearch={setSucceededSearch}
          failedSearch={failedSearch}
          setFailedSearch={setFailedSearch}
          filteredSucceeded={filteredSucceeded}
          filteredFailed={filteredFailed}
          renderHeader={renderHeader}
          handleScroll={handleScroll}
          handleJobClick={handleJobClick}
          setIsKpiModalOpen={setIsKpiModalOpen}
        />
      )}

      {/* VIEW 3: LOGIN / SIGNUP PAGE */}
      {view === 'login' && (
        <LoginPage 
          onLoginSuccess={handleLoginSuccess}
          onNavigate={navigate}
        />
      )}

      {/* Pop-Up Modal Window for the Chart Graph & Run Logs */}
      <JobDetailModal
        activeJob={activeJob}
        onClose={handleCloseModal}
        syncCount={syncCount}
        config={config}
      />

      {/* KPI Breakdown Circle Graph Modal */}
      <KpiBreakdownModal
        isOpen={isKpiModalOpen}
        onClose={() => setIsKpiModalOpen(false)}
        kpis={kpis}
      />

    </div>
  )
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="*" element={<AppContent />} />
      </Routes>
    </Router>
  )
}

export default App
