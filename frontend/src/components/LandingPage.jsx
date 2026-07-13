import { memo } from 'react'

const LandingPage = memo(({ pipelineSteps, onNavigate }) => {
  return (
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
            <button className="btn btn-primary" onClick={() => onNavigate('/dashboard')}>Open Dashboard</button>
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
  )
})
LandingPage.displayName = 'LandingPage'

export default LandingPage
