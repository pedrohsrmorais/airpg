import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import api from '../services/api';

const ATTR_LABELS = {
  strength:'Força', dexterity:'Destreza', constitution:'Constituição',
  intelligence:'Inteligência', wisdom:'Sabedoria', charisma:'Carisma'
};

const s = {
  page: { minHeight:'100vh', background:'var(--bg-darkest)', paddingTop:60 },
  wrap: { maxWidth:900, margin:'0 auto', padding:'2rem 1.5rem' },
  top: { display:'flex', gap:'2rem', marginBottom:'2rem', flexWrap:'wrap' },
  sheet: { flex:1, minWidth:280 },
  name: { fontSize:'2rem', marginBottom:'.2rem' },
  sub: { color:'var(--text-dim)', fontStyle:'italic', marginBottom:'1.25rem' },
  attrs: { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'.75rem', marginBottom:'1.25rem' },
  attr: { background:'var(--bg-panel)', border:'1px solid var(--border)', borderRadius:4, padding:'.6rem .5rem', textAlign:'center' },
  attrLabel: { display:'block', fontFamily:'Cinzel,serif', fontSize:'.6rem', letterSpacing:'.1em', color:'var(--text-dim)', textTransform:'uppercase', marginBottom:'.25rem' },
  attrVal: { fontSize:'1.6rem', fontWeight:700, color:'var(--gold-light)', lineHeight:1 },
  attrMod: { display:'block', fontSize:'.75rem', color:'var(--text-muted)', marginTop:'.2rem' },
  hpBar: { background:'var(--bg-panel)', border:'1px solid var(--border)', borderRadius:4, padding:'.75rem 1rem', marginBottom:'.75rem' },
  hpLabel: { fontFamily:'Cinzel,serif', fontSize:'.7rem', letterSpacing:'.1em', color:'var(--gold-dark)', textTransform:'uppercase', marginBottom:'.35rem' },
  barBg: { height:10, background:'var(--bg-dark)', borderRadius:5, overflow:'hidden', marginBottom:'.3rem' },
  barFill: { height:'100%', borderRadius:5, background:'linear-gradient(to right,#8b1a1a,#c0392b)', transition:'width .4s' },
  hpText: { fontSize:'.85rem', color:'var(--text-dim)', textAlign:'right' },
  actions: { display:'flex', gap:'.75rem', flexWrap:'wrap', marginTop:'1.25rem' },
  btn: { padding:'.5rem 1rem', background:'var(--bg-card)', border:'1px solid var(--border-gold)', color:'var(--gold)', fontFamily:'Cinzel,serif', fontSize:'.75rem', letterSpacing:'.06em', borderRadius:3, cursor:'pointer', transition:'all .2s', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:'.4rem' },
};

export default function CharacterPage() {
  const { id } = useParams();
  const [char, setChar] = useState(null);

  useEffect(() => {
    api.get(`/characters/${id}`).then(r => setChar(r.data));
  }, [id]);

  if (!char) return <div style={{ color:'var(--gold)', textAlign:'center', padding:'4rem', fontFamily:'Cinzel,serif' }}>Carregando ficha...</div>;

  const mod = v => Math.floor((v - 10) / 2);
  const modStr = v => { const m = mod(v); return (m >= 0 ? '+' : '') + m; };
  const hpPct = Math.round((char.current_hp / char.max_hp) * 100);

  return (
    <div style={s.page}>
      <Navbar character={char} />
      <div style={s.wrap}>
        <div style={s.top}>
          <div style={s.sheet}>
            <h1 style={s.name}>{char.name}</h1>
            <p style={s.sub}>{char.race} — {char.class} • Nível {char.level || 1}</p>

            {/* HP */}
            <div style={s.hpBar}>
              <div style={s.hpLabel}>Pontos de Vida</div>
              <div style={s.barBg}>
                <div style={{...s.barFill, width:`${hpPct}%`}} />
              </div>
              <div style={s.hpText}>{char.current_hp} / {char.max_hp}</div>
            </div>

            {/* Attributes */}
            <div style={s.attrs}>
              {Object.entries(ATTR_LABELS).map(([key, label]) => (
                <div key={key} style={s.attr}>
                  <span style={s.attrLabel}>{label}</span>
                  <span style={s.attrVal}>{char[key]}</span>
                  <span style={s.attrMod}>{modStr(char[key])}</span>
                </div>
              ))}
            </div>

            {/* Gold & stats */}
            <div className="panel" style={{ display:'flex', justifyContent:'space-around', textAlign:'center' }}>
              <div>
                <div style={{ fontFamily:'Cinzel,serif', fontSize:'.65rem', color:'var(--text-dim)', letterSpacing:'.1em', textTransform:'uppercase' }}>Ouro</div>
                <div style={{ fontSize:'1.4rem', color:'var(--gold)', fontWeight:700 }}>⬤ {char.gold}</div>
              </div>
              <div>
                <div style={{ fontFamily:'Cinzel,serif', fontSize:'.65rem', color:'var(--text-dim)', letterSpacing:'.1em', textTransform:'uppercase' }}>CA</div>
                <div style={{ fontSize:'1.4rem', color:'var(--silver-light)', fontWeight:700 }}>{char.armor_class || 10}</div>
              </div>
              <div>
                <div style={{ fontFamily:'Cinzel,serif', fontSize:'.65rem', color:'var(--text-dim)', letterSpacing:'.1em', textTransform:'uppercase' }}>Iniciativa</div>
                <div style={{ fontSize:'1.4rem', color:'var(--silver-light)', fontWeight:700 }}>{modStr(char.dexterity)}</div>
              </div>
            </div>
          </div>

          {/* Background */}
          <div style={{ flex:1, minWidth:240 }}>
            <div className="card" style={{ height:'100%' }}>
              <h3 style={{ marginBottom:'.75rem', fontSize:'1rem' }}>📜 Antecedente</h3>
              <p style={{ color:'var(--text-dim)', fontStyle:'italic', lineHeight:1.7 }}>
                {char.background || 'Nenhum antecedente registrado nas crônicas.'}
              </p>

              <div className="divider" style={{ margin:'1rem 0' }}>✦</div>

              <div style={{ display:'flex', flexDirection:'column', gap:'.4rem', fontSize:'.9rem' }}>
                <div><span style={{ color:'var(--gold-dark)' }}>Mundo: </span>{char.world_name || '—'}</div>
                <div><span style={{ color:'var(--gold-dark)' }}>Região: </span>{char.region_name || '—'}</div>
                <div><span style={{ color:'var(--gold-dark)' }}>Local: </span>{char.location_name || '—'}</div>
                <div><span style={{ color:'var(--gold-dark)' }}>Posição: </span>{char.pos_x?.toFixed(1)}, {char.pos_y?.toFixed(1)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div style={s.actions}>
          <Link to={`/world/${char.world_id}`} style={s.btn}>🗺 Ir ao Mundo</Link>
          <Link to={`/inventory/${char.id}`}   style={s.btn}>🎒 Inventário</Link>
        </div>
      </div>
    </div>
  );
}
