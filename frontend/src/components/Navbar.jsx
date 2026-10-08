import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const styles = {
  nav: {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
    background: 'linear-gradient(to bottom, rgba(10,8,4,0.98), rgba(17,14,8,0.95))',
    borderBottom: '1px solid var(--border-gold)',
    padding: '0.6rem 1.5rem',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    backdropFilter: 'blur(8px)',
  },
  brand: {
    fontFamily: 'Cinzel, serif', fontSize: '1.3rem', fontWeight: 900,
    color: 'var(--gold-light)', letterSpacing: '0.12em',
    textDecoration: 'none', textShadow: '0 0 12px rgba(201,168,76,0.3)',
  },
  links: { display: 'flex', gap: '1.5rem', alignItems: 'center' },
  link: {
    fontFamily: 'Cinzel, serif', fontSize: '0.75rem', letterSpacing: '0.1em',
    color: 'var(--text-dim)', textDecoration: 'none', textTransform: 'uppercase',
    transition: 'color 0.2s',
  },
  user: { color: 'var(--silver)', fontSize: '0.9rem', fontStyle: 'italic' },
  logoutBtn: {
    background: 'none', border: '1px solid var(--border-gold)',
    color: 'var(--gold-dark)', fontFamily: 'Cinzel, serif',
    fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase',
    padding: '0.3rem 0.75rem', borderRadius: '3px', cursor: 'pointer',
    transition: 'all 0.2s',
  },
};

export default function Navbar({ character }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() { logout(); navigate('/login'); }

  return (
    <nav style={styles.nav}>
      <Link to="/dashboard" style={styles.brand}>⚔ AIRPG</Link>

      <div style={styles.links}>
        {character && (
          <>
            <Link to={`/world/${character.world_id}`}     style={styles.link}>Mundo</Link>
            <Link to={`/inventory/${character.id}`}       style={styles.link}>Inventário</Link>
          </>
        )}
        <Link to="/dashboard" style={styles.link}>Personagens</Link>
      </div>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <span style={styles.user}>{user?.username}</span>
        <button style={styles.logoutBtn} onClick={handleLogout}>Sair</button>
      </div>
    </nav>
  );
}
