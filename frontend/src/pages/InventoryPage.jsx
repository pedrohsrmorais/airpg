import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import api from '../services/api';

const RARITY_ORDER = ['common','uncommon','rare','epic','legendary','unique'];
const TYPE_ICONS = { weapon:'⚔', armor:'🛡', consumable:'🧪', magic:'✨', resource:'💎', tool:'🔧', key:'🗝', junk:'🗑', misc:'📦' };

export default function InventoryPage() {
  const { characterId } = useParams();
  const [char,  setChar]  = useState(null);
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [pickupDesc, setPickupDesc] = useState('');
  const [pickupRes,  setPickupRes]  = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get(`/characters/${characterId}`).then(r => setChar(r.data));
    api.get(`/characters/${characterId}/inventory`).then(r => setItems(r.data));
  }, [characterId]);

  async function handleEquip(itemId, slot) {
    await api.patch(`/characters/${characterId}/inventory/${itemId}/equip`, { slot });
    const { data } = await api.get(`/characters/${characterId}/inventory`);
    setItems(data);
  }

  async function handleDrop(itemId) {
    if (!confirm('Descartar este item?')) return;
    await api.delete(`/characters/${characterId}/inventory/${itemId}`);
    setItems(prev => prev.filter(i => i.id !== itemId));
  }

  async function handlePickup(e) {
    e.preventDefault();
    setLoading(true); setPickupRes(null);
    try {
      const { data } = await api.post(`/characters/${characterId}/pickup`, { description: pickupDesc });
      setPickupRes(data);
      if (data.success) {
        const { data: inv } = await api.get(`/characters/${characterId}/inventory`);
        setItems(inv);
        setPickupDesc('');
      }
    } catch (err) {
      setPickupRes({ success: false, narration: err.response?.data?.error || 'Erro.' });
    } finally { setLoading(false); }
  }

  const filtered = filter === 'all' ? items : items.filter(i => i.type === filter);

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg-darkest)', paddingTop:60 }}>
      <Navbar character={char} />
      <div style={{ maxWidth:900, margin:'0 auto', padding:'2rem 1.5rem' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:'1.5rem', flexWrap:'wrap', gap:'1rem' }}>
          <div>
            <h1>🎒 Inventário</h1>
            <p className="dim">{char?.name} — {items.length} itens</p>
          </div>
          <div style={{ display:'flex', gap:'.5rem', flexWrap:'wrap' }}>
            {['all','weapon','armor','consumable','magic','misc'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ padding:'.3rem .7rem', background: filter===f ? 'var(--gold-dark)' : 'var(--bg-card)',
                  border:'1px solid var(--border-gold)', color: filter===f ? 'var(--bg-darkest)' : 'var(--gold)',
                  fontFamily:'Cinzel,serif', fontSize:'.7rem', borderRadius:3, cursor:'pointer', letterSpacing:'.05em', textTransform:'uppercase' }}>
                {f === 'all' ? 'Todos' : f}
              </button>
            ))}
          </div>
        </div>

        {/* World pickup */}
        <div className="card" style={{ marginBottom:'1.5rem' }}>
          <h3 style={{ marginBottom:'.75rem', fontSize:'.95rem' }}>📦 Guardar objeto do mundo</h3>
          <form onSubmit={handlePickup} style={{ display:'flex', gap:'.75rem', flexWrap:'wrap' }}>
            <input value={pickupDesc} onChange={e => setPickupDesc(e.target.value)}
              placeholder="ex: um vaso antigo de cerâmica azul" required
              style={{ flex:1, minWidth:200 }}/>
            <button type="submit" disabled={loading}
              style={{ padding:'.5rem 1rem', background:'var(--bg-panel)', border:'1px solid var(--border-gold)',
                color:'var(--gold)', fontFamily:'Cinzel,serif', fontSize:'.78rem', borderRadius:3, cursor:'pointer' }}>
              {loading ? '...' : '✦ Guardar'}
            </button>
          </form>
          {pickupRes && (
            <div style={{ marginTop:'.75rem', padding:'.6rem .85rem',
              background: pickupRes.success ? 'rgba(76,175,80,0.1)' : 'rgba(139,26,26,0.2)',
              border:`1px solid ${pickupRes.success ? '#4caf50' : 'var(--crimson)'}`, borderRadius:3,
              color: pickupRes.success ? '#81c784' : '#e07070', fontSize:'.9rem', fontStyle:'italic' }}>
              {pickupRes.narration}
            </div>
          )}
        </div>

        {/* Items list */}
        {filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'3rem', opacity:.5 }}>
            <div style={{ fontSize:'2.5rem', marginBottom:'1rem' }}>🎒</div>
            <p className="dim">Nenhum item nesta categoria.</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'.6rem' }}>
            {filtered.sort((a,b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity)).map(item => (
              <div key={item.id} className="card" style={{ display:'flex', gap:'1rem', alignItems:'center' }}>
                <div style={{ fontSize:'1.8rem', width:40, textAlign:'center', flexShrink:0 }}>
                  {TYPE_ICONS[item.type] || '📦'}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', gap:'.5rem', alignItems:'baseline', flexWrap:'wrap' }}>
                    <span style={{ fontFamily:'Cinzel,serif', fontSize:'.95rem', color:'var(--text-main)' }}>{item.name}</span>
                    <span className={`rarity-${item.rarity}`} style={{ fontSize:'.75rem', textTransform:'capitalize' }}>{item.rarity}</span>
                    {item.equipped && <span style={{ fontSize:'.7rem', background:'rgba(201,168,76,0.15)', border:'1px solid var(--border-gold)', color:'var(--gold)', padding:'.1rem .4rem', borderRadius:2 }}>equipado [{item.slot}]</span>}
                    {item.is_world_item && <span style={{ fontSize:'.7rem', color:'var(--text-muted)', fontStyle:'italic' }}>objeto do mundo</span>}
                  </div>
                  <p style={{ color:'var(--text-dim)', fontSize:'.88rem', marginTop:'.15rem' }}>{item.description}</p>
                  <div style={{ display:'flex', gap:'1rem', marginTop:'.3rem', fontSize:'.8rem', color:'var(--text-muted)' }}>
                    <span>💰 {item.base_value} ouro</span>
                    <span>⚖ {item.weight}kg</span>
                    {item.quantity > 1 && <span>×{item.quantity}</span>}
                  </div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:'.4rem', flexShrink:0 }}>
                  {(item.type === 'weapon' || item.type === 'armor') && !item.equipped && (
                    <button onClick={() => handleEquip(item.id, item.type === 'weapon' ? 'main_hand' : 'body')}
                      style={{ padding:'.3rem .7rem', background:'var(--bg-panel)', border:'1px solid var(--border-gold)',
                        color:'var(--gold)', fontFamily:'Cinzel,serif', fontSize:'.7rem', borderRadius:2, cursor:'pointer' }}>
                      Equipar
                    </button>
                  )}
                  <button onClick={() => handleDrop(item.id)}
                    style={{ padding:'.3rem .7rem', background:'rgba(139,26,26,0.2)', border:'1px solid var(--blood)',
                      color:'#e07070', fontFamily:'Cinzel,serif', fontSize:'.7rem', borderRadius:2, cursor:'pointer' }}>
                    Descartar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
