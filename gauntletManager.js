const BEASTS = require('./beasts.js');
const BEAST_KEYS = Object.keys(BEASTS);
const { lobby, battles, pushCpuBattle, broadcast, send, pushLobby } = require('./state');
const { applyAtk, tickEffects, getStartState } = require('./battleEngine');
const { settleGauntlet, getPlayerStats, getPlayerRank, getTopPlayers } = require('./hp-balance');
const { cpuPickAttack } = require('./cpuAI'); // NUEVO: Importar IA unificada

const CPU_ID = -1;
const CPU_NAME = 'Zodiac Master';

async function endGauntlet(bId, playerId, won) {
  const b = battles.get(bId);
  const pl = lobby.get(playerId);
  if (!pl) return;
  const wallet = pl.wallet;
  const newHp = await settleGauntlet(wallet, won);
  const stats = await getPlayerStats(wallet);
  const rank = await getPlayerRank(wallet);
  send(pl.ws, { type:'battle_end', won, isGauntlet: true, newHp, stats: { wins: stats.wins, losses: stats.losses, rank } });
  pl.inBattle = false;
  battles.delete(bId);
  await pushLobby();
  const top = await getTopPlayers(3);
  broadcast({ type: 'leaderboard_update', top });
}

async function checkGauntletCpuDeath(bId) {
  const b = battles.get(bId); if (!b) return false;
  const cpuSt = b.cpuIsP1 ? b.st1 : b.st2;
  const plSt  = b.cpuIsP1 ? b.st2 : b.st1;
  const plId  = b.cpuIsP1 ? b.p2id : b.p1id;
  
  if (cpuSt.hp <= 0) {
    b.turnId = -2; 
    pushCpuBattle(bId); 
    setTimeout(() => {
      try {
        const bb = battles.get(bId); if (!bb) return;
        bb.gauntletIndex++;
        if (bb.gauntletIndex >= BEAST_KEYS.length) {
          endGauntlet(bId, plId, true);
        } else {
          const pl = lobby.get(plId);
          if (!pl) return endGauntlet(bId, plId, false);
          bb.cpuBeast = BEAST_KEYS[bb.gauntletIndex];
          bb.st1 = getStartState(bb.cpuBeast);
          bb.turnId = CPU_ID; 
          bb.logs.push({t:`¡Jefe derrotado! Prepárate para ${BEASTS[bb.cpuBeast].name} (${bb.gauntletIndex+1}/12). HP restaurado.`, c:'good'});
          send(pl.ws, { type: 'gauntlet_next', battleId: bId, nextBeast: bb.cpuBeast, round: bb.gauntletIndex+1, logs: bb.logs.slice(-14) });
        }
      } catch(e) { console.error("Gauntlet advance error:", e); }
    }, 1500); 
    return true;
  }
  if (plSt.hp <= 0) {
    b.turnId = -2;
    pushCpuBattle(bId);
    setTimeout(() => {
      try { endGauntlet(bId, plId, false); } catch(e) { console.error("Gauntlet loss error:", e); }
    }, 1500);
    return true;
  }
  return false;
}

function scheduleGauntletCpuTurn(bId) {
  const b = battles.get(bId); if (!b || !b.isCpu || b.turnId !== CPU_ID) return;
  setTimeout(async () => { 
    const bb = battles.get(bId); if (!bb || bb.turnId !== CPU_ID) return; 
    try { await doGauntletCpuTurn(bId); } catch(e) { console.error("Gauntlet CPU turn error:", e); }
  }, 1100 + Math.random() * 600);
}

async function doGauntletCpuTurn(bId) {
  const b = battles.get(bId); if (!b) return;
  const cpuSt = b.cpuIsP1 ? b.st1 : b.st2;
  const plSt  = b.cpuIsP1 ? b.st2 : b.st1;
  const plId  = b.cpuIsP1 ? b.p2id : b.p1id;
  const pl = lobby.get(plId); if (!pl) return;

  b.logs.push(...tickEffects(cpuSt));
  if (await checkGauntletCpuDeath(bId)) return;

  if (cpuSt.stun) { 
    cpuSt.stun = false; 
    b.logs.push({t: `${CPU_NAME} aturdido — pierde turno`, c: 'special'}); 
  } else if (cpuSt.recharge > 0) { 
    cpuSt.recharge--; 
    b.logs.push({t: `${CPU_NAME} recargando...`, c: 'special'}); 
  } else {
    const idx = cpuPickAttack(cpuSt, plSt, b.cpuBeast); // USA IA UNIFICADA
    const atk = BEASTS[b.cpuBeast].attacks[idx];
    if (cpuSt.pp[idx] < 99) cpuSt.pp[idx]--;
    b.logs.push(...applyAtk(cpuSt, plSt, atk, CPU_NAME));
    if (await checkGauntletCpuDeath(bId)) return;
  }

  b.turnId = plId;
  pushCpuBattle(bId);

  const bb = battles.get(bId); if (!bb) return;
  const plStNow = b.cpuIsP1 ? bb.st2 : bb.st1;
  if (plStNow.stun || plStNow.recharge > 0) {
    setTimeout(async () => { 
      const bbb = battles.get(bId); if (!bbb || bbb.turnId !== plId) return; 
      try { await processGauntletPlayerTurn(bId, plId, -1); } catch(e) { console.error(e); }
    }, 900);
  }
}

async function processGauntletPlayerTurn(bId, playerId, atkIndex) {
  const b = battles.get(bId); if (!b || !b.isCpu || b.turnId !== playerId) return;
  const plIsP1 = !b.cpuIsP1;
  const plSt = plIsP1 ? b.st1 : b.st2;
  const cpuSt = plIsP1 ? b.st2 : b.st1;
  const pl = lobby.get(playerId); if (!pl) return;

  b.logs.push(...tickEffects(plSt));
  if (await checkGauntletCpuDeath(bId)) return;

  if (plSt.stun) { 
    plSt.stun = false; 
    b.logs.push({t: `${pl.name} aturdido — pierde turno`, c: 'special'}); 
  } else if (plSt.recharge > 0) { 
    plSt.recharge--; 
    b.logs.push({t: `${pl.name} recargando...`, c: 'special'}); 
  } else if (atkIndex >= 0) {
    const atks = BEASTS[pl.beast]?.attacks;
    const atk = atks?.[atkIndex]; if (!atk) return;
    if (plSt.pp[atkIndex] <= 0) {
      b.logs.push({t: `${pl.name} intentó usar ${atk.n} pero no tiene PP. ¡Turno perdido!`, c: 'bad'});
      b.turnId = CPU_ID; pushCpuBattle(bId); scheduleGauntletCpuTurn(bId); return;
    }
    if (plSt.pp[atkIndex] < 99) plSt.pp[atkIndex]--;
    b.logs.push(...applyAtk(plSt, cpuSt, atk, pl.name));
    if (await checkGauntletCpuDeath(bId)) return;
  }
  
  b.turnId = CPU_ID; 
  pushCpuBattle(bId); 
  scheduleGauntletCpuTurn(bId);
}

module.exports = { 
  processGauntletPlayerTurn,
  endGauntlet,
  scheduleGauntletCpuTurn
};
