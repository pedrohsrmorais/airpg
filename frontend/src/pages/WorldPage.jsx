import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import Navbar from '../components/Navbar';
import api from '../services/api';

export default function WorldPage() {
  const { worldId } = useParams();
  const [searchParams] = useSearchParams();
  const characterId = searchParams.get('character');

  const [world,    setWorld]    = useState(null);
  const [char,     setChar]     = useState(null);
  const [nearby,   setNearby]   = useState([]);
  const [messages, setMessages] = useState([]);
  const [session,  setSession]  = useState(null);
  const [oocInput, setOocInput] = useState('');
  const [actionInput, setActionInput] = useState('');
  const [loading, setLoading]   = useState(false);

  const socketRef = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    api.get(`/worlds/${worldId}`).then(r => setWorld(r.data));
    if (characterId) {
      api.get(`/characters/${characterId}`).then(r => setChar(r.data));
      refreshNearby();
    }

    // Socket
    const token = localStorage.getItem('airpg_token');
    const sock  = io({ auth: { token } });
    socketRef.current = sock;

    sock.emit('join_world', { worldId: parseInt(worldId), characterId: parseInt(characterId) });

    sock.on('session_started', (data) => {
      addMsg({ type:'system', text:`⚔ Combate iniciado! ${data.participants.map(p=>p.name).join(' vs ')}` });
      if (data.participants.find(p => p.id === parseInt(characterId))) {
        sock.emit('join_session', { sessionId: data.sessionId });
        setSession({ id: data.sessionId, type: data.type, firstActor: data.first_actor });
      }
    });

    sock.on('player_action_declared', (data) => {
      addMsg({ type:'declared', text:`${data.character_name}: "${data.input}"`, turn: data.turn });
    });

    sock.on('turn_result', (data) => {
      addMsg({ type:'narration', text: data.narration, character: data.character_name });
    });

    sock.on('your_turn', (data) => {
      if (data.character_id === parseInt(characterId)) {
        addMsg({ type:'system', text:`⚡ É a sua vez! Turno ${data.turn}.` });
      } else {
        addMsg({ type:'system', text:`🕐 Vez de ${data.character_name}. Turno ${data.turn}.` });
      }
    });

    sock.on('turn_auto', (data) => {
      addMsg({ type:'auto', text:`⏱ Turno automático: ${data.narration}` });
    });

    sock.on('session_ended', (data) => {
      addMsg({ type:'system', text:`✦ ${data.last_narration}` });
      setSession(null);
    });

    sock.on('ooc_message', (data) => {
      addMsg({ type:'ooc', text:`[OOC] ${data.character_name}: ${data.message}` });
    });

    sock.on('character_moved', (data) => {
      addMsg({ type:'world', text:`Um aventureiro se moveu.` });
    });

    sock.on('autonomous_action', (data) => {
      addMsg({ type:'world', text:`${data.character} → ${data.action} (${data.reason})` });
    });

    return () => sock.disconnect();
  }, [worldId, characterId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior:'smooth' });
  }, [messages]);

  function addMsg(m) {
    setMessages(prev => [...prev, { ...m, id: Date.now() + Math.random() }]);
  }

  async function refreshNearby() {
    if (!characterId) return;
    const { data } = await api.get(`/worlds/${worldId}/nearby?characterId=${characterId}&radius=10`);
    setNearby(data);
  }

  async function handleAction(e) {
    e.preventDefault();
    if (!actionInput.trim() || !session) return;
    setLoading(true);
    try {
      await api.post(`/worlds/${worldId}/interactions/${session.id}/turn`, {
        character_id: characterId, input: actionInput
      });
      setActionInput('');
    } catch (err) {
      addMsg({ type:'error', text: err.response?.data?.error || 'Erro ao enviar ação.' });
    } finally { setLoading(false); }
  }

  async function handleOoc(e) {
    e.preventDefault();
    if (!oocInput.trim() || !session) return;
    await api.post(`/worlds/${worldId}/interactions/${session.id}/ooc`, {
      character_id: characterId, message: oocInput
    });
    setOocInput('');
  }

  async function startCombat(targetId) {
    const { data } = await api.post(`/worlds/${worldId}/interactions`, {
      type: 'combat', initiator_id: parseInt(characterId), participants: [targetId]
    });
    socketRef.current.emit('join_session', { sessionId: data.session_id });
    setSession({ id: data.session_id, type:'combat' });
    addMsg({ type:'system', text:`⚔ Combate iniciado com ${nearby.find(n=>n.id===targetId)?.name}!` });
  }

  const msgColor = { system:'#c9a84c', narration:'var(--text-main)', declared:'#b0c4de', ooc:'#a89060', auto:'#8b8b6b', error:'#e07070', world:'var(--text-muted)' };

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg-darkest)', paddingTop:60, display:'flex', flexDirection:'column' }}>
      <Navbar character={char} />
      <div style={{ flex:1, maxWidth:1100, margin:'0 auto', padding:'1.5rem', width:'100%', display:'grid', gridTemplateColumns:'1fr 300px', gap:'1.25rem' }}>

        {/* Main chat */}
        <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <h1>{world?.name || 'Carregando...'}</h1>
              <p className="dim">{char?.location_name || 'Local desconhecido'} — {char?.region_name}</p>
            </div>
            {session && (
              <div style={{ padding:'.4rem .85rem', background:'rgba(139,26,26,0.2)', border:'1px solid var(--crimson)', borderRadius:3, fontSize:'.8rem', color:'#e07070', fontFamily:'Cinzel,serif' }}>
                ⚔ Em combate
              </div>
            )}
          </div>

          {/* Dialog box */}
          <div style={{ flex:1, background:'var(--bg-panel)', border:'1px solid var(--border)', borderRadius:4, padding:'1rem', minHeight:320, maxHeight:'calc(100vh - 380px)', overflowY:'auto', display:'flex', flexDirection:'column', gap:'.6rem' }}>
            {messages.length === 0 && (
              <p style={{ color:'var(--text-muted)', fontStyle:'italic', textAlign:'center', margin:'auto' }}>
                Aguardando eventos do mundo...
              </p>
            )}
            {messages.map(m => (
              <div key={m.id} style={{ borderLeft:`3px solid ${msgColor[m.type] || 'var(--border)'}`, paddingLeft:'.75rem' }}>
                <p style={{ color: msgColor[m.type] || 'var(--text-main)', fontSize:'.95rem', lineHeight:1.5 }}>
                  {m.text}
                </p>
              </div>
            ))}
            <div ref={chatEndRef}/>
          </div>

          {/* Inputs */}
          {session && (
            <div style={{ display:'flex', flexDirection:'column', gap:'.6rem' }}>
              <form onSubmit={handleAction} style={{ display:'flex', gap:'.6rem' }}>
                <input value={actionInput} onChange={e => setActionInput(e.target.value)}
                  placeholder="Descreva sua ação (ex: Ataco com minha espada)..."
                  style={{ flex:1 }} disabled={loading}/>
                <button type="submit" disabled={loading}
                  style={{ padding:'.5rem 1rem', background:'var(--crimson)', border:'1px solid #c0392b', color:'#fff', fontFamily:'Cinzel,serif', fontSize:'.8rem', borderRadius:3, cursor:'pointer', letterSpacing:'.05em' }}>
                  {loading ? '...' : '⚔ Agir'}
                </button>
              </form>
              <form onSubmit={handleOoc} style={{ display:'flex', gap:'.6rem' }}>
                <input value={oocInput} onChange={e => setOocInput(e.target.value)}
                  placeholder="[OOC] Mensagem privada (o DM não ouve)..."
                  style={{ flex:1, opacity:.7 }}/>
                <button type="submit"
                  style={{ padding:'.5rem .85rem', background:'var(--bg-card)', border:'1px solid var(--border)', color:'var(--text-dim)', fontFamily:'Cinzel,serif', fontSize:'.75rem', borderRadius:3, cursor:'pointer' }}>
                  OOC
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
          {/* Nearby */}
          <div className="panel">
            <h3 style={{ fontSize:'.9rem', marginBottom:'.75rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              Nas Proximidades
              <button onClick={refreshNearby} style={{ background:'none', border:'none', color:'var(--gold-dark)', cursor:'pointer', fontSize:'.85rem' }}>↻</button>
            </h3>
            {nearby.length === 0 ? (
              <p className="dim" style={{ fontSize:'.85rem' }}>Ninguém por perto.</p>
            ) : nearby.map(n => (
              <div key={n.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'.5rem' }}>
                <div>
                  <span style={{ fontSize:'.9rem' }}>{n.name}</span>
                  <p style={{ fontSize:'.75rem', color:'var(--text-muted)' }}>{n.race} · {n.distance?.toFixed(1)} m</p>
                </div>
                {!session && (
                  <button onClick={() => startCombat(n.id)}
                    style={{ padding:'.25rem .55rem', background:'rgba(139,26,26,0.2)', border:'1px solid var(--blood)',
                      color:'#e07070', fontFamily:'Cinzel,serif', fontSize:'.65rem', borderRadius:2, cursor:'pointer' }}>
                    Atacar
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Regions */}
          {world?.regions && (
            <div className="panel">
              <h3 style={{ fontSize:'.9rem', marginBottom:'.75rem' }}>Regiões</h3>
              {world.regions.map(r => (
                <div key={r.id} style={{ marginBottom:'.4rem', fontSize:'.85rem' }}>
                  <span style={{ color: r.id === char?.region_id ? 'var(--gold)' : 'var(--text-dim)' }}>
                    {r.id === char?.region_id ? '▶ ' : '  '}{r.name}
                  </span>
                  <span style={{ color:'var(--text-muted)', fontSize:'.75rem', marginLeft:'.4rem' }}>({r.type})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
