import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import api from '../services/api';

const RARITY_ICON = { common:'⚪', uncommon:'🟢', rare:'🔵', epic:'🟣', legendary:'🟠', unique:'🔴' };
const TYPE_ICONS  = { weapon:'⚔', armor:'🛡', consumable:'🧪', magic:'✨', resource:'💎', tool:'🔧', key:'🗝', junk:'🗑', misc:'📦' };

export default function MarketPage() {
  const { marketId }       = useParams();
  const [searchParams]     = useSearchParams();
  const characterId        = searchParams.get('character');

  const [market,  setMarket]  = useState(null);
  const [char,    setChar]    = useState(null);
  const [tab,     setTab]     = useState('buy');
  const [inventory, setInventory] = useState([]);
  const [msg,     setMsg]     = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get(`/markets/${marketId}`).then(r => setMarket(r.data));
    if (characterId) {
      api.get(`/characters/${characterId}`).then(r => setChar(r.data));
      api.get(`/characters/${characterId}/inventory`).then(r => setInventory(r.data));
    }
  }, [marketId, characterId]);

  async function handleBuy(itemCatalogId, price, name) {
    if (!characterId) return setMsg({ type:'error', text:'Selecione um personagem primeiro.' });
    if (!confirm(`Comprar "${name}" por ${price.toFixed(0)} ouros?`)) return;
    setLoading(true); setMsg(null);
    try {
      const { data } = await api.post(`/markets/${marketId}/buy`, {
        character_id: characterId, item_catalog_id: itemCatalogId, quantity: 1
      });
      setMsg({ type:'success', text: `✓ Comprado! ${data.gold_remaining} ouros restantes.` });
      setChar(c => ({ ...c, gold: data.gold_remaining }));
      setMarket(prev => ({
        ...prev,
        stock: prev.stock.map(s => s.item_catalog_id === itemCatalogId
          ? { ...s, quantity: s.quantity - 1 }
          : s
        ).filter(s => s.quantity > 0)
      }));
    } catch (err) {
      setMsg({ type:'error', text: err.response?.data?.error || 'Erro ao comprar.' });
    } finally { setLoading(false); }
  }

  async function handleSell(invItemId, name, price) {
    if (!confirm(`Vender "${name}" por ${price.toFixed(0)} ouros?`)) return;
    setLoading(true); setMsg(null);
    try {
      const { data } = await api.post(`/markets/${marketId}/sell`, {
        character_id: characterId, inventory_item_id: invItemId
      });
      setMsg({ type:'success', text: `✓ Vendido por ${data.gold_received.toFixed(0)} ouros!` });
      setInventory(prev => prev.filter(i => i.id !== invItemId));
      setChar(c => ({ ...c, gold: (c.gold || 0) + data.gold_received }));
    } catch (err) {
      setMsg({ type:'error', text: err.response?.data?.error || 'Erro ao vender.' });
    } finally { setLoading(false); }
  }

  if (!market) return <div style={{ padding:'4rem', textAlign:'center', fontFamily:'Cinzel,serif', color:'var(--gold)' }}>Abrindo portas do mercado...</div>;

  const MARKET_TYPE_NAMES = { general:'Mercado Geral', blacksmith:'Ferraria', magic:'Loja de Magia', alchemist:'Alquimista', black_market:'Mercado Negro' };

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg-darkest)', paddingTop:60 }}>
      <Navbar character={char} />
      <div style={{ maxWidth:940, margin:'0 auto', padding:'2rem 1.5rem' }}>
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1.5rem', flexWrap:'wrap', gap:'1rem' }}>
          <div>
            <h1>🏪 {market.name}</h1>
            <p className="dim">{MARKET_TYPE_NAMES[market.type] || market.type}</p>
          </div>
          {char && (
            <div className="card" style={{ textAlign:'right' }}>
              <p style={{ fontFamily:'Cinzel,serif', fontSize:'.7rem', color:'var(--text-dim)', letterSpacing:'.1em', textTransform:'uppercase' }}>Seu ouro</p>
              <p style={{ fontSize:'1.5rem', color:'var(--gold)', fontWeight:700 }}>⬤ {char.gold}</p>
            </div>
          )}
        </div>

        {/* Message */}
        {msg && (
          <div style={{ padding:'.65rem 1rem', marginBottom:'1rem', borderRadius:3, fontSize:'.9rem',
            background: msg.type==='success' ? 'rgba(76,175,80,0.12)' : 'rgba(139,26,26,0.2)',
            border:`1px solid ${msg.type==='success' ? '#4caf50' : 'var(--crimson)'}`,
            color: msg.type==='success' ? '#81c784' : '#e07070' }}>
            {msg.text}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display:'flex', gap:'.5rem', marginBottom:'1.25rem' }}>
          {['buy','sell'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding:'.5rem 1.25rem', background: tab===t ? 'var(--gold-dark)' : 'var(--bg-card)',
                border:'1px solid var(--border-gold)', color: tab===t ? 'var(--bg-darkest)' : 'var(--gold)',
                fontFamily:'Cinzel,serif', fontSize:'.8rem', borderRadius:3, cursor:'pointer', letterSpacing:'.06em' }}>
              {t === 'buy' ? '🛒 Comprar' : '💰 Vender'}
            </button>
          ))}
        </div>

        {/* Buy tab */}
        {tab === 'buy' && (
          market.stock.length === 0 ? (
            <div style={{ textAlign:'center', padding:'3rem', opacity:.5 }}>
              <p className="dim">Este mercado está sem estoque no momento.</p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'.6rem' }}>
              {market.stock.map(item => {
                const finalPrice = item.price_override ?? item.base_value * item.buy_modifier;
                return (
                  <div key={item.item_catalog_id} className="card" style={{ display:'flex', gap:'1rem', alignItems:'center' }}>
                    <div style={{ fontSize:'1.8rem', width:40, textAlign:'center', flexShrink:0 }}>
                      {TYPE_ICONS[item.type] || '📦'}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', gap:'.5rem', alignItems:'baseline', flexWrap:'wrap' }}>
                        <span style={{ fontFamily:'Cinzel,serif', fontSize:'.95rem' }}>{item.name}</span>
                        <span style={{ fontSize:'.75rem' }}>{RARITY_ICON[item.rarity]} {item.rarity}</span>
                        <span style={{ fontSize:'.75rem', color:'var(--text-muted)' }}>×{item.quantity}</span>
                      </div>
                      <p style={{ color:'var(--text-dim)', fontSize:'.88rem', marginTop:'.1rem' }}>{item.description}</p>
                      <p style={{ color:'var(--text-muted)', fontSize:'.78rem', marginTop:'.15rem' }}>
                        ⚖ {item.weight}kg {item.requirements?.level && `• Nível ${item.requirements.level}`}
                      </p>
                    </div>
                    <div style={{ flexShrink:0, textAlign:'right' }}>
                      <p style={{ color:'var(--gold)', fontWeight:700, marginBottom:'.4rem' }}>⬤ {finalPrice.toFixed(0)}</p>
                      <button onClick={() => handleBuy(item.item_catalog_id, finalPrice, item.name)} disabled={loading}
                        style={{ padding:'.35rem .85rem', background:'var(--bg-panel)', border:'1px solid var(--border-gold)',
                          color:'var(--gold)', fontFamily:'Cinzel,serif', fontSize:'.75rem', borderRadius:3, cursor:'pointer' }}>
                        Comprar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* Sell tab */}
        {tab === 'sell' && (
          !characterId ? (
            <p className="dim">Adicione ?character=ID na URL para vender itens.</p>
          ) : inventory.filter(i => !i.is_quest_item).length === 0 ? (
            <div style={{ textAlign:'center', padding:'3rem', opacity:.5 }}>
              <p className="dim">Nenhum item para vender.</p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'.6rem' }}>
              {inventory.filter(i => !i.is_quest_item).map(item => {
                const sellPrice = item.base_value * item.sell_modifier;
                return (
                  <div key={item.id} className="card" style={{ display:'flex', gap:'1rem', alignItems:'center' }}>
                    <div style={{ fontSize:'1.8rem', width:40, textAlign:'center', flexShrink:0 }}>
                      {TYPE_ICONS[item.type] || '📦'}
                    </div>
                    <div style={{ flex:1 }}>
                      <span style={{ fontFamily:'Cinzel,serif', fontSize:'.95rem' }}>{item.name}</span>
                      <p style={{ color:'var(--text-dim)', fontSize:'.88rem' }}>{item.description}</p>
                      {item.is_world_item && <p style={{ color:'var(--text-muted)', fontSize:'.78rem', fontStyle:'italic' }}>objeto do mundo</p>}
                    </div>
                    <div style={{ flexShrink:0, textAlign:'right' }}>
                      <p style={{ color:'var(--gold)', fontWeight:700, marginBottom:'.4rem' }}>⬤ {sellPrice.toFixed(0)}</p>
                      <button onClick={() => handleSell(item.id, item.name, sellPrice)} disabled={loading}
                        style={{ padding:'.35rem .85rem', background:'rgba(76,175,80,0.1)', border:'1px solid #4caf50',
                          color:'#81c784', fontFamily:'Cinzel,serif', fontSize:'.75rem', borderRadius:3, cursor:'pointer' }}>
                        Vender
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
