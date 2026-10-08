'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const client   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const AI_MODEL = process.env.AI_MODEL || 'claude-opus-4-5';

// ── parseIntent ──────────────────────────────────────────────────────────────
// Takes raw player text and returns structured JSON intent.
async function parseIntent(input, context = {}) {
  const system = `Você é o motor de interpretação de um RPG de fantasia.
Converta a ação do jogador em JSON estruturado.
Responda APENAS com JSON válido, sem markdown.

Ações possíveis: attack, defend, flee, move, loot, talk, use_item, craft, trade, examine, pickup_world_item, other

Exemplo:
{"action":"attack","target":"goblin","item":"espada longa","details":"ataque frontal"}`;

  const userMsg = `Contexto: ${JSON.stringify(context)}
Ação do jogador: "${input}"`;

  const msg = await client.messages.create({
    model:      AI_MODEL,
    max_tokens: 256,
    system,
    messages: [{ role: 'user', content: userMsg }],
  });

  try {
    return JSON.parse(msg.content[0].text);
  } catch {
    return { action: 'other', raw: input };
  }
}

// ── narrate ──────────────────────────────────────────────────────────────────
// Takes engine result and produces narrative text.
async function narrate(engineResult, context = {}) {
  const system = `Você é o Mestre de um RPG de fantasia sombria.
Narre o resultado da ação de forma dramática e imersiva em português.
Máximo 3 frases. Baseie-se apenas nos fatos fornecidos.`;

  const userMsg = `Resultado do motor: ${JSON.stringify(engineResult)}
Contexto da cena: ${JSON.stringify(context)}
Narre o resultado:`;

  const msg = await client.messages.create({
    model:      AI_MODEL,
    max_tokens: 512,
    system,
    messages: [{ role: 'user', content: userMsg }],
  });

  return msg.content[0].text.trim();
}

// ── validateWorldPickup ───────────────────────────────────────────────────────
// AI decides if a world object is a valid item for the inventory.
async function validateWorldPickup(objectDescription, characterContext = {}) {
  const system = `Você é árbitro de um RPG.
Decida se o objeto descrito pelo jogador é carregável (cabe em uma mochila ou bolso, não é um ser vivo, não é imóvel).
Responda APENAS com JSON:
{"valid": true/false, "reason": "...", "suggested_name": "...", "estimated_weight": 0.5, "estimated_value": 10}`;

  const msg = await client.messages.create({
    model:      AI_MODEL,
    max_tokens: 256,
    system,
    messages: [{
      role: 'user',
      content: `Personagem: ${JSON.stringify(characterContext)}\nObjeto: "${objectDescription}"`
    }],
  });

  try {
    return JSON.parse(msg.content[0].text);
  } catch {
    return { valid: false, reason: 'Não foi possível avaliar o objeto.' };
  }
}

// ── narrateLoot ───────────────────────────────────────────────────────────────
async function narrateLoot(lootResult, context = {}) {
  const system = `Você é o Mestre de um RPG. Narre o resultado de uma ação de saque em 2-3 frases dramáticas.`;
  const msg = await client.messages.create({
    model:      AI_MODEL,
    max_tokens: 300,
    system,
    messages: [{
      role: 'user',
      content: `Resultado: ${JSON.stringify(lootResult)}\nContexto: ${JSON.stringify(context)}`
    }],
  });
  return msg.content[0].text.trim();
}

// ── autonomousIntent ──────────────────────────────────────────────────────────
async function autonomousIntent(character, context = {}) {
  const system = `Você controla um personagem de RPG offline.
Decida a próxima ação autônoma baseada no estado e localização.
Responda em JSON: {"action":"train","reason":"..."}`;

  const msg = await client.messages.create({
    model:      AI_MODEL,
    max_tokens: 256,
    system,
    messages: [{
      role: 'user',
      content: `Personagem: ${JSON.stringify({ name: character.name, class: character.class, hp: character.hp, gold: character.gold })}
Contexto: ${JSON.stringify(context)}`
    }],
  });

  try {
    return JSON.parse(msg.content[0].text);
  } catch {
    return { action: 'idle', reason: 'Aguardando oportunidade.' };
  }
}

module.exports = { parseIntent, narrate, validateWorldPickup, narrateLoot, autonomousIntent };
