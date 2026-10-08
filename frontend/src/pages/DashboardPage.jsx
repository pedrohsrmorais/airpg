import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import api from '../services/api';
import '../styles/dashboard.css';

const RACES   = ['Human', 'Elf', 'Dwarf', 'Halfling', 'Orc', 'Tiefling', 'Dragonborn'];
const CLASSES = ['Fighter', 'Wizard', 'Rogue', 'Cleric', 'Ranger', 'Paladin', 'Druid', 'Barbarian'];

export default function DashboardPage() {
  const navigate = useNavigate();
  const [characters, setCharacters] = useState([]);
  const [worlds,     setWorlds]     = useState([]);
  const [creating,   setCreating]   = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [form,       setForm]       = useState({
    name: '', world_id: '', race: 'Human', char_class: 'Fighter', background: '', gold: 50
  });
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/characters'), api.get('/worlds')])
      .then(([c, w]) => { setCharacters(c.data); setWorlds(w.data); })
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/characters', form);
      setCharacters(prev => [data, ...prev]);
      setCreating(false);
      setForm({ name: '', world_id: '', race: 'Human', char_class: 'Fighter', background: '', gold: 50 });
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao criar personagem.');
    }
  }

  const rarityClass = (r) => `rarity-${r}`;

  return (
    <div className="dashboard-bg">
      <Navbar />
      <div className="dashboard-content">
        <div className="dashboard-header">
          <div>
            <h1>Seus Heróis</h1>
            <p className="dim">Escolha quem vai enfrentar as trevas hoje.</p>
          </div>
          <button className="btn-primary" onClick={() => setCreating(!creating)}>
            {creating ? '✕ Cancelar' : '+ Forjar Herói'}
          </button>
        </div>

        {/* Create form */}
        {creating && (
          <div className="card create-form">
            <h3>⚔ Novo Aventureiro</h3>
            <form onSubmit={handleCreate} className="char-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Nome</label>
                  <input required value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Kael Shadowmere" />
                </div>
                <div className="form-group">
                  <label>Mundo</label>
                  <select required value={form.world_id} onChange={e => setForm(f => ({...f, world_id: e.target.value}))}>
                    <option value="">Selecione...</option>
                    {worlds.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Raça</label>
                  <select value={form.race} onChange={e => setForm(f => ({...f, race: e.target.value}))}>
                    {RACES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Classe</label>
                  <select value={form.char_class} onChange={e => setForm(f => ({...f, char_class: e.target.value}))}>
                    {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Lore / Antecedente</label>
                <textarea rows={2} value={form.background}
                  onChange={e => setForm(f => ({...f, background: e.target.value}))}
                  placeholder="Era uma noite de tempestade quando..." style={{width:'100%', resize:'vertical'}} />
              </div>
              {error && <p style={{color:'#e07070', fontSize:'0.9rem'}}>{error}</p>}
              <button type="submit" className="btn-primary">✦ Forjar Aventureiro</button>
            </form>
          </div>
        )}

        {/* Character grid */}
        {loading ? (
          <p className="dim" style={{textAlign:'center', marginTop:'3rem'}}>Convocando seus heróis...</p>
        ) : characters.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">⚔</div>
            <h3>Nenhum herói forjado ainda</h3>
            <p className="dim">Clique em "Forjar Herói" para começar sua jornada.</p>
          </div>
        ) : (
          <div className="character-grid">
            {characters.map(c => (
              <div key={c.id} className="char-card" onClick={() => navigate(`/character/${c.id}`)}>
                <div className="char-card-top">
                  <div className="char-avatar">{c.name[0]}</div>
                  <div className="char-info">
                    <h3>{c.name}</h3>
                    <p className="dim">{c.race} • {c.class}</p>
                    <p style={{fontSize:'0.8rem', color:'var(--text-muted)'}}>Nível {c.level || 1}</p>
                  </div>
                  {!c.is_alive && <span className="dead-badge">☠ Morto</span>}
                </div>

                <div className="char-stats">
                  <div className="stat-bar">
                    <span className="stat-label">HP</span>
                    <div className="bar-bg">
                      <div className="bar-fill hp-fill"
                           style={{width: `${Math.round((c.current_hp / c.max_hp) * 100)}%`}}/>
                    </div>
                    <span className="stat-val">{c.current_hp}/{c.max_hp}</span>
                  </div>
                </div>

                <div className="char-footer">
                  <span className="gold">⬤ {c.gold} ouros</span>
                  <span className="dim" style={{fontSize:'0.8rem'}}>{c.world_name || 'Sem mundo'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
