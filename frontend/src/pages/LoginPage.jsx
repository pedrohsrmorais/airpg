import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/login.css';

export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [mode,     setMode]     = useState('login'); // 'login' | 'register'
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
        if (!username.trim()) { setError('Nome de aventureiro obrigatório.'); setLoading(false); return; }
        await register(email, password, username);
      }
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Algo deu errado. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-bg">
      {/* Floating particles */}
      <div className="particles">
        {[...Array(12)].map((_, i) => <span key={i} className="particle" style={{ '--i': i }} />)}
      </div>

      <div className="login-container">
        {/* Logo */}
        <div className="login-logo">
          <svg width="72" height="72" viewBox="0 0 72 72" fill="none" className="logo-svg">
            {/* Shield */}
            <path d="M36 4 L64 16 L64 38 C64 52 50 64 36 68 C22 64 8 52 8 38 L8 16 Z"
                  fill="none" stroke="#c9a84c" strokeWidth="2.5" strokeLinejoin="round"/>
            {/* Inner shield */}
            <path d="M36 12 L56 22 L56 38 C56 49 47 57 36 61 C25 57 16 49 16 38 L16 22 Z"
                  fill="rgba(201,168,76,0.06)" stroke="#8a6d28" strokeWidth="1" strokeLinejoin="round"/>
            {/* Sword */}
            <line x1="36" y1="18" x2="36" y2="56" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="26" y1="30" x2="46" y2="30" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round"/>
            <ellipse cx="36" cy="55" rx="3" ry="4" fill="#c9a84c" opacity="0.9"/>
            {/* Stars */}
            <circle cx="22" cy="20" r="1.5" fill="#c9a84c" opacity="0.6"/>
            <circle cx="50" cy="20" r="1.5" fill="#c9a84c" opacity="0.6"/>
            <circle cx="22" cy="50" r="1" fill="#c9a84c" opacity="0.4"/>
            <circle cx="50" cy="50" r="1" fill="#c9a84c" opacity="0.4"/>
          </svg>
          <div>
            <h1 className="login-title">AIRPG</h1>
            <p className="login-subtitle">As Terras de Eldoria</p>
          </div>
        </div>

        {/* Tagline */}
        <p className="login-tagline">
          {mode === 'login'
            ? 'Bem-vindo de volta, aventureiro.'
            : 'Comece sua jornada pelas terras de Eldoria.'}
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="login-form">
          {mode === 'register' && (
            <div className="form-group">
              <label>Nome do Aventureiro</label>
              <input
                type="text"
                placeholder="Como serás conhecido nas tavernas..."
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="off"
                maxLength={40}
              />
            </div>
          )}

          <div className="form-group">
            <label>Pergaminho de Identidade (Email)</label>
            <input
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label>Palavra Secreta</label>
            <input
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
            <div className="login-error">
              <span>⚠</span> {error}
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading
              ? '...'
              : mode === 'login'
                ? '⚔ Entrar nas Terras'
                : '✦ Forjar minha Lenda'}
          </button>
        </form>

        {/* Switch mode */}
        <div className="divider">✦</div>
        <p className="login-switch">
          {mode === 'login' ? (
            <>
              Ainda não tens uma lenda?{' '}
              <button onClick={() => { setMode('register'); setError(''); }} className="link-btn">
                Criar personagem
              </button>
            </>
          ) : (
            <>
              Já és um veterano?{' '}
              <button onClick={() => { setMode('login'); setError(''); }} className="link-btn">
                Entrar
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
