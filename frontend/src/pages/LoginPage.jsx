import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/login.css';

// Ember particle config: x position (%), animation duration, delay, sway direction
const PARTICLES = [
  { x: '8%',  dur: '7.2s', delay: '0s',    sway: '18px'  },
  { x: '14%', dur: '9.5s', delay: '1.1s',  sway: '-22px' },
  { x: '22%', dur: '6.8s', delay: '0.4s',  sway: '14px'  },
  { x: '31%', dur: '8.1s', delay: '2.2s',  sway: '-16px' },
  { x: '40%', dur: '7.6s', delay: '0.8s',  sway: '20px'  },
  { x: '52%', dur: '9.0s', delay: '3.1s',  sway: '-12px' },
  { x: '61%', dur: '6.5s', delay: '1.6s',  sway: '24px'  },
  { x: '70%', dur: '8.7s', delay: '0.2s',  sway: '-18px' },
  { x: '78%', dur: '7.3s', delay: '2.8s',  sway: '15px'  },
  { x: '85%', dur: '9.2s', delay: '0.9s',  sway: '-20px' },
  { x: '91%', dur: '6.9s', delay: '1.9s',  sway: '10px'  },
  { x: '96%', dur: '8.4s', delay: '3.5s',  sway: '-14px' },
];

export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [mode,     setMode]     = useState('login');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        if (!username.trim()) {
          setError('O nome do aventureiro é obrigatório.');
          setLoading(false);
          return;
        }
        await register(email, password, username);
      }
      navigate('/characters');
    } catch (err) {
      setError(err.response?.data?.error || 'As portas de Eldoria estão fechadas. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  function switchMode(m) {
    setMode(m);
    setError('');
    setEmail('');
    setPassword('');
    setUsername('');
  }

  return (
    <div className="login-bg">
      {/* Animated background image */}
      <div className="login-hero" aria-hidden="true" />

      {/* Gradient vignette */}
      <div className="login-vignette" aria-hidden="true" />

      {/* Floating embers */}
      <div className="particles" aria-hidden="true">
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="particle"
            style={{
              '--x':     p.x,
              '--dur':   p.dur,
              '--delay': p.delay,
              '--sway':  p.sway,
            }}
          />
        ))}
      </div>

      {/* Right-side auth panel */}
      <div className="login-panel">

        {/* Logo / Emblem */}
        <div className="login-logo-wrap">
          <svg className="login-emblem" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="bg-grad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#2e1f0a"/>
                <stop offset="100%" stopColor="#0a0804"/>
              </radialGradient>
              <radialGradient id="glow-grad" cx="50%" cy="45%" r="40%">
                <stop offset="0%" stopColor="#c9a84c" stopOpacity="0.25"/>
                <stop offset="100%" stopColor="transparent"/>
              </radialGradient>
              <filter id="sword-glow">
                <feGaussianBlur stdDeviation="3" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            {/* Background */}
            <circle cx="100" cy="100" r="96" fill="url(#bg-grad)" stroke="#6b521c" strokeWidth="1.5"/>
            <circle cx="100" cy="100" r="96" fill="url(#glow-grad)"/>
            <circle cx="100" cy="100" r="88" fill="none" stroke="#3d2f10" strokeWidth="0.8"/>
            {/* Ring marks */}
            <g stroke="#8a6d28" strokeWidth="1.5" opacity="0.5">
              <line x1="100" y1="6"   x2="100" y2="17"/>
              <line x1="100" y1="183" x2="100" y2="194"/>
              <line x1="6"   y1="100" x2="17"  y2="100"/>
              <line x1="183" y1="100" x2="194" y2="100"/>
              <line x1="33"  y1="33"  x2="41"  y2="41"/>
              <line x1="159" y1="159" x2="167" y2="167"/>
              <line x1="167" y1="33"  x2="159" y2="41"/>
              <line x1="41"  y1="159" x2="33"  y2="167"/>
            </g>
            {/* Shield outer */}
            <path d="M100 28 L158 52 L158 97 C158 138 132 161 100 172 C68 161 42 138 42 97 L42 52 Z"
                  fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinejoin="round"/>
            {/* Shield inner */}
            <path d="M100 38 L148 60 L148 96 C148 130 126 150 100 161 C74 150 52 130 52 96 L52 60 Z"
                  fill="rgba(201,168,76,0.04)" stroke="#7a5e20" strokeWidth="1" strokeLinejoin="round"/>
            {/* Sword blade */}
            <line x1="100" y1="48"  x2="100" y2="148"
                  stroke="#c9a84c" strokeWidth="2.8" strokeLinecap="round" filter="url(#sword-glow)"/>
            {/* Blade highlight */}
            <line x1="101.5" y1="50" x2="101.5" y2="130"
                  stroke="#e8cb7a" strokeWidth="0.8" strokeLinecap="round" opacity="0.45"/>
            {/* Crossguard */}
            <line x1="76"  y1="80" x2="124" y2="80"
                  stroke="#c9a84c" strokeWidth="2.8" strokeLinecap="round" filter="url(#sword-glow)"/>
            {/* Grip wrapping */}
            <line x1="98" y1="86"  x2="102" y2="86"  stroke="#8a6d28" strokeWidth="1.5"/>
            <line x1="98" y1="93"  x2="102" y2="93"  stroke="#8a6d28" strokeWidth="1.5"/>
            <line x1="98" y1="100" x2="102" y2="100" stroke="#8a6d28" strokeWidth="1.5"/>
            <line x1="98" y1="107" x2="102" y2="107" stroke="#8a6d28" strokeWidth="1.5"/>
            <line x1="98" y1="114" x2="102" y2="114" stroke="#8a6d28" strokeWidth="1.5"/>
            {/* Pommel */}
            <ellipse cx="100" cy="148" rx="7" ry="9" fill="#c9a84c" opacity="0.9"/>
            <ellipse cx="100" cy="146" rx="4" ry="3" fill="#e8cb7a" opacity="0.4"/>
            {/* Gem top */}
            <polygon points="100,49 104,55 100,53 96,55" fill="#e8cb7a" opacity="0.7"/>
            {/* Decorative stars */}
            <circle cx="68"  cy="62"  r="2.5" fill="#c9a84c" opacity="0.65"/>
            <circle cx="132" cy="62"  r="2.5" fill="#c9a84c" opacity="0.65"/>
            <circle cx="60"  cy="112" r="1.8" fill="#c9a84c" opacity="0.45"/>
            <circle cx="140" cy="112" r="1.8" fill="#c9a84c" opacity="0.45"/>
          </svg>

          <h1 className="login-game-title">AIRPG</h1>
          <p className="login-game-subtitle">As Terras de Eldoria</p>
        </div>

        {/* Divider */}
        <div className="login-divider-rune">✦ ✦ ✦</div>

        {/* Mode tabs */}
        <div className="login-tabs" role="tablist">
          <button
            className={`login-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => switchMode('login')}
            role="tab"
            aria-selected={mode === 'login'}
          >
            Entrar
          </button>
          <button
            className={`login-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => switchMode('register')}
            role="tab"
            aria-selected={mode === 'register'}
          >
            Criar Conta
          </button>
        </div>

        {/* Lore tagline */}
        <p className="login-lore">
          {mode === 'login'
            ? 'Bem-vindo de volta, aventureiro. O mundo aguarda.'
            : 'Uma nova lenda está prestes a ser escrita.'}
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="login-form" noValidate>
          {mode === 'register' && (
            <div className="login-field">
              <label htmlFor="username">Nome do Aventureiro</label>
              <input
                id="username"
                type="text"
                placeholder="Como serás conhecido em Eldoria..."
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="nickname"
                maxLength={40}
                autoFocus
              />
            </div>
          )}

          <div className="login-field">
            <label htmlFor="email">Pergaminho de Identidade</label>
            <input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
              autoFocus={mode === 'login'}
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Palavra Secreta</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={6}
            />
          </div>

          {error && (
            <div className="login-error-msg" role="alert">
              <span aria-hidden="true">⚠</span>
              {error}
            </div>
          )}

          <button
            type="submit"
            className={`login-submit${loading ? ' login-submit-loading' : ''}`}
            disabled={loading}
          >
            {loading
              ? 'Invocando'
              : mode === 'login'
                ? '⚔  Entrar nas Terras'
                : '✦  Forjar minha Lenda'}
          </button>
        </form>

        {/* Switch mode */}
        <div className="login-switch-wrap">
          {mode === 'login' ? (
            <>
              Ainda não tens uma lenda?{' '}
              <button className="login-switch-btn" onClick={() => switchMode('register')}>
                Criar conta
              </button>
            </>
          ) : (
            <>
              Já és um veterano?{' '}
              <button className="login-switch-btn" onClick={() => switchMode('login')}>
                Entrar
              </button>
            </>
          )}
        </div>

        <span className="login-version">v0.1.0 — Early Access</span>
      </div>
    </div>
  );
}
