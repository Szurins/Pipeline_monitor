import { useState } from 'react'

const LoginPage = ({ onLoginSuccess, onNavigate }) => {
  const [mode, setMode] = useState('login') // 'login' or 'register'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')
    
    if (!username.trim() || !password.trim()) {
      setErrorMsg('Please enter both username and password.')
      return
    }

    if (mode === 'register' && password !== repeatPassword) {
      setErrorMsg('Passwords do not match.')
      return
    }

    setIsLoading(true)
    const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register'

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Authentication failed. Please try again.')
      }

      if (mode === 'login') {
        onLoginSuccess(data.token, data.username)
      } else {
        setSuccessMsg('Account created successfully! Switching to login...')
        setUsername('')
        setPassword('')
        setRepeatPassword('')
        setTimeout(() => {
          setMode('login')
          setSuccessMsg('')
        }, 1500)
      }
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const toggleMode = () => {
    setMode(prev => prev === 'login' ? 'register' : 'login')
    setErrorMsg('')
    setSuccessMsg('')
    setUsername('')
    setPassword('')
    setRepeatPassword('')
  }

  return (
    <div className="login-container">
      <div className="login-card animate-slide-down">
        <h2 className="login-title">
          {mode === 'login' ? 'Welcome Back' : 'Create Account'}
        </h2>
        <p className="login-subtitle">
          {mode === 'login' 
            ? 'Sign in to access your data pipeline telemetry' 
            : 'Register a new user to start monitoring runs'
          }
        </p>

        {errorMsg && (
          <div className="alert-message alert-error">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="alert-message alert-success">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              className="form-input"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              className="form-input"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>

          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label" htmlFor="repeatPassword">Repeat Password</label>
              <input
                type="password"
                id="repeatPassword"
                className="form-input"
                placeholder="Confirm password"
                value={repeatPassword}
                onChange={(e) => setRepeatPassword(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>
          )}

          <button 
            type="submit" 
            className="btn btn-primary login-btn"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="inline-spinner"></span>
                {mode === 'login' ? 'Signing In...' : 'Registering...'}
              </>
            ) : (
              mode === 'login' ? 'Sign In' : 'Create User'
            )}
          </button>
        </form>

        <div className="login-footer">
          {mode === 'login' ? (
            <p>
              Don't have an account?{' '}
              <button onClick={toggleMode} className="login-link">
                Register User
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{' '}
              <button onClick={toggleMode} className="login-link">
                Sign In
              </button>
            </p>
          )}
          
          <button 
            onClick={() => onNavigate('/')} 
            className="login-link" 
            style={{ marginTop: '1.25rem', fontSize: '0.8rem', opacity: 0.7 }}
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
