import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import Navbar from '../components/Navbar';
import '../styles/character-select.css';

const RACES = ['Humano', 'Elfo', 'Anão', 'Halfling', 'Orc', 'Tiefling', 'Draconato'];
const CLASSES = ['Guerreiro', 'Mago', 'Ladino', 'Clérigo', 'Paladino', 'Ranger', 'Druida', 'Bárbaro'];

const CLASS_ICONS = {
  Guerreiro: '⚔️',
  Mago:      '🧙',
  Ladino:    '🗡️',
  Clérigo:   '✨',
  Paladino:  '🛡️',
  Ranger:    '🏹',
  Druida:    '🌿',
  Bárbaro:   '🪓',
};

const RACE_ICONS = {
  Humano:    '👤',
  Elfo:      '🧝',
  Anão:      '⛏️',
  Halfling:  '🍀',
  Orc:       '💪',
  Tiefling:  '😈',
  Draconato: '🐉',
};

const DEFAULT_ATTRS = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };
const ATTR_LABELS   = { strength: 'FOR', dexterity: 'DES', constitution: 'CON', intelligence: 'INT', wisdom: 'SAB', charisma: 'CAR' };
const ATTR_NAMES    = Object.keys(DEFAULT_ATTRS);

function mod(val) {
  const m = Math.floor((Number(val) - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

function hpClass(pct) {
  if (pct >= 60) return 'healthy';
  if (pct >= 25) return 'wounded';
  return '';
}

export default function CharacterSelectPage() {
  const { user } = useAuth();
  const navigate  = useNavigate();

  const [characters, setCharacters] = useState([]);
  const [worlds,     setWorlds]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState(null);
  const [creating,   setCreating]   = useState(false);

  const blankForm = {
    name: '', world_id: '', race: RACES[0], class: CLASSES[0], background: '',
    ...DEFAULT_ATTRS,
  };
  const [form,    setForm]    = useState(blankForm);
  const [saving,  setSaving]  = useState(false);
  const [formErr, setFormErr] = useState('');

  /* ── Fetch data ─────────────────────────────────────────────── */
  useEffect(() => {
    Promise.all([api.get('/characters'), api.get('/worlds')])
      .then(([cRes, wRes]) => {
        setCharacters(cRes.data);
        setWorlds(wRes.data);
        if (wRes.data.length > 0) {
          setForm(f => ({ ...f, world_id: wRes.data[0].id }));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  /* ── Handlers ───────────────────────────────────────────────── */
  function openCreation() {
    setFormErr('');
    setForm({ ...blankForm, world_id: worlds[0]?.id ?? '' });
    setCreating(true);
  }

  function closeCreation() {
    setCreating(false);
    setFormErr('');
  }

  function setAttr(key, value) {
    const n = Math.min(20, Math.max(1, Number(value) || 1));
    setForm(f => ({ ...f, [key]: n }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setFormErr('');
    if (!form.name.trim())    { setFormErr('O nome do personagem é obrigatório.'); return; }
    if (!form.world_id)       { setFormErr('Escolhe um mundo para começar.'); return; }
    setSaving(true);
    try {
      const payload = {
        name:         form.name.trim(),
        world_id:     Number(form.world_id),
        race:         form.race,
        class:        form.class,
        background:   form.background.trim(),
        strength:     Number(form.strength),
        dexterity:    Number(form.dexterity),
        constitution: Number(form.constitution),
        intelligence: Number(form.intelligence),
        wisdom:       Number(form.wisdom),
        charisma:     Number(form.charisma),
      };
      const res = await api.post('/characters', payload);
      setCharacters(prev => [...prev, res.data]);
      setCreating(false);
    } catch (err) {
      setFormErr(err.response?.data?.error || 'Não foi possível forjar o personagem. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  function enterWorld(char) {
    if (!char.is_alive) return;
    navigate(`/world/${char.world_id}?character=${char.id}`);
  }

  /* ── Render ─────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="char-select-bg">
        <Navbar />
        <div className="char-select-header">
          <p>Carregando lendas…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="char-select-bg">
      <Navbar />

      {/* Header */}
      <header className="char-select-header">
        <h1>Escolhe o Teu Destino</h1>
        <p>Seleciona um herói ou forja uma nova lenda em Eldoria</p>
      </header>

      {/* Cards row */}
      <div className="char-select-row">
        {characters.length === 0 && (
          <div className="char-empty">
            <div className="char-empty-icon">⚔️</div>
            <p>Nenhum herói ainda. Cria o teu primeiro personagem.</p>
          </div>
        )}

        {characters.map(char => {
          const hpPct    = char.max_hp > 0 ? Math.round((char.current_hp / char.max_hp) * 100) : 0;
          const classIcon = CLASS_ICONS[char.class] ?? '⚔️';
          const isSelected = selected === char.id;

          return (
            <div
              key={char.id}
              className={`char-card-select${isSelected ? ' selected' : ''}${!char.is_alive ? ' dead' : ''}`}
              onClick={() => char.is_alive && setSelected(char.id === selected ? null : char.id)}
            >
              {/* Portrait */}
              <div className="char-portrait">
                <div className="char-portrait-icon">{classIcon}</div>
                {/* Badge */}
                {!char.is_alive ? (
                  <span className="char-card-badge dead-badge">☠ Morto</span>
                ) : (
                  <span className="char-card-badge level-badge">Nv {char.level ?? 1}</span>
                )}
              </div>

              {/* Body */}
              <div className="char-card-body">
                <div className="char-card-name">{char.name}</div>
                <div className="char-card-meta">{char.race} · {char.class}</div>

                {/* HP bar */}
                <div className="char-hp-bar">
                  <span className="char-hp-label">HP</span>
                  <div className="char-hp-track">
                    <div
                      className={`char-hp-fill ${hpClass(hpPct)}`}
                      style={{ width: `${hpPct}%` }}
                    />
                  </div>
                  <span className="char-hp-val">{char.current_hp}/{char.max_hp}</span>
                </div>

                {/* Gold */}
                <div className="char-gold">
                  <span>✦</span>
                  <span>{(char.gold ?? 0).toLocaleString('pt-BR')} ouro</span>
                </div>

                {/* Location */}
                {char.location && (
                  <div className="char-location">📍 {char.location}</div>
                )}

                {/* Enter button */}
                <button
                  className="char-enter-btn"
                  disabled={!char.is_alive}
                  onClick={e => { e.stopPropagation(); enterWorld(char); }}
                >
                  {char.is_alive ? '⚔  Entrar no Mundo' : '☠  Caído em Batalha'}
                </button>
              </div>
            </div>
          );
        })}

        {/* New character card */}
        <div className="char-new-card" onClick={openCreation}>
          <span className="char-new-icon">✦</span>
          <span className="char-new-label">Novo Personagem</span>
        </div>
      </div>

      {/* Creation modal */}
      {creating && (
        <div className="char-modal-overlay" onClick={e => { if (e.target === e.currentTarget) closeCreation(); }}>
          <div className="char-modal" role="dialog" aria-modal="true" aria-label="Criar personagem">

            <h2>⚔ Forjar um Herói</h2>
            <p className="char-modal-sub">Define a tua lenda nas Terras de Eldoria.</p>

            <form onSubmit={handleCreate} noValidate>
              <div className="char-form-grid">

                {/* Name */}
                <div className="char-form-field span-2">
                  <label htmlFor="cf-name">Nome do Personagem</label>
                  <input
                    id="cf-name"
                    type="text"
                    placeholder="Como serás chamado…"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    maxLength={50}
                    autoFocus
                  />
                </div>

                {/* Race */}
                <div className="char-form-field">
                  <label htmlFor="cf-race">Raça</label>
                  <select id="cf-race" value={form.race} onChange={e => setForm(f => ({ ...f, race: e.target.value }))}>
                    {RACES.map(r => <option key={r} value={r}>{RACE_ICONS[r]} {r}</option>)}
                  </select>
                </div>

                {/* Class */}
                <div className="char-form-field">
                  <label htmlFor="cf-class">Classe</label>
                  <select id="cf-class" value={form.class} onChange={e => setForm(f => ({ ...f, class: e.target.value }))}>
                    {CLASSES.map(c => <option key={c} value={c}>{CLASS_ICONS[c]} {c}</option>)}
                  </select>
                </div>

                {/* World */}
                <div className="char-form-field span-2">
                  <label htmlFor="cf-world">Mundo de Início</label>
                  <select id="cf-world" value={form.world_id} onChange={e => setForm(f => ({ ...f, world_id: e.target.value }))}>
                    {worlds.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    {worlds.length === 0 && <option value="">— Nenhum mundo disponível —</option>}
                  </select>
                </div>

                {/* Background */}
                <div className="char-form-field span-2">
                  <label htmlFor="cf-bg">História de Fundo (opcional)</label>
                  <textarea
                    id="cf-bg"
                    placeholder="De onde vens? O que te trouxe a Eldoria…"
                    value={form.background}
                    onChange={e => setForm(f => ({ ...f, background: e.target.value }))}
                    maxLength={500}
                  />
                </div>

                {/* Attributes */}
                <div className="char-form-section">Atributos</div>

                <div className="attr-grid span-2">
                  {ATTR_NAMES.map(attr => (
                    <div key={attr} className="attr-field">
                      <label htmlFor={`cf-${attr}`}>{ATTR_LABELS[attr]}</label>
                      <input
                        id={`cf-${attr}`}
                        type="number"
                        min={1}
                        max={20}
                        value={form[attr]}
                        onChange={e => setAttr(attr, e.target.value)}
                      />
                      <span className="attr-mod">{mod(form[attr])}</span>
                    </div>
                  ))}
                </div>

                {/* Error */}
                {formErr && (
                  <div className="char-form-error" role="alert">
                    ⚠ {formErr}
                  </div>
                )}

              </div>

              {/* Actions */}
              <div className="char-modal-actions">
                <button type="submit" className="btn-forge" disabled={saving}>
                  {saving ? 'Forjando…' : '✦  Forjar Lenda'}
                </button>
                <button type="button" className="btn-cancel" onClick={closeCreation}>
                  Cancelar
                </button>
              </div>
            </form>

          </div>
        </div>
      )}
    </div>
  );
}
