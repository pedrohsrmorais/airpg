import React from 'react';

export default function LoadingScreen() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      height: '100vh', gap: '1.5rem',
      background: 'var(--bg-darkest)',
    }}>
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
        <polygon points="40,5 75,62 5,62" stroke="#c9a84c" strokeWidth="2" fill="none" opacity="0.5">
          <animateTransform attributeName="transform" type="rotate" from="0 40 40" to="360 40 40" dur="3s" repeatCount="indefinite"/>
        </polygon>
        <circle cx="40" cy="40" r="12" stroke="#c9a84c" strokeWidth="1.5" fill="none" opacity="0.8"/>
        <circle cx="40" cy="40" r="4" fill="#c9a84c" opacity="0.9"/>
      </svg>
      <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', fontSize: '0.9rem', letterSpacing: '0.2em' }}>
        CARREGANDO…
      </p>
    </div>
  );
}
