const { getHP } = require('./hp-balance');

// Memoria central del juego
const lobby = new Map();      // id -> { ws, name, beast, wallet, inBattle, id }
const battles = new Map();    // battleId -> battle object
const processedTx = new Set();
let nextId = 1;

function uid() { return nextId++; }

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function broadcast(obj) {
  lobby.forEach(p => send(p.ws, obj));
}

async function lobbyList() {
  const list = [];
  for (const [id, p] of lobby) {
    if (!p.inBattle) {
      list.push({ id, name: p.name, beast: p.beast, hp: await getHP(p.wallet) });
    }
  }
  return list;
}

async function pushLobby() {
  broadcast({ type: 'lobby', players: await lobbyList() });
}

function pushBattle(bId) {
  const b = battles.get(bId); if (!b) return;
  const p1 = lobby.get(b.p1id), p2 = lobby.get(b.p2id);
  if (!p1 || !p2) return;
  const base = {
    type: 'battle_state', battleId: bId,
    p1: { name: p1.name, beast: p1.beast, state: b.st1 },
    p2: { name: p2.name, beast: p2.beast, state: b.st2 },
    logs: b.logs.slice(-14)
  };
  send(p1.ws, { ...base, yourTurn: b.turnId === b.p1id });
  send(p2.ws, { ...base, yourTurn: b.turnId === b.p2id });
}

function pushCpuBattle(bId) {
  const b = battles.get(bId); if (!b) return;
  const pl = lobby.get(b.cpuIsP1 ? b.p2id : b.p1id); if (!pl) return;
  const cpuSide = { name: 'Zodiac Master', beast: b.cpuBeast, state: b.cpuIsP1 ? b.st1 : b.st2 };
  const plSide = { name: pl.name, beast: pl.beast, state: b.cpuIsP1 ? b.st2 : b.st1 };
  send(pl.ws, {
    type: 'battle_state', battleId: bId,
    p1: b.cpuIsP1 ? cpuSide : plSide,
    p2: b.cpuIsP1 ? plSide : cpuSide,
    logs: b.logs.slice(-14),
    yourTurn: b.turnId !== -1 // -1 es CPU_ID
  });
}

module.exports = {
  lobby, battles, processedTx, uid,
  send, broadcast, pushLobby, pushBattle, pushCpuBattle
};
