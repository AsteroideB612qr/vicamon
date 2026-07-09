const BEASTS = require('./beasts.js');
const { lobby, battles, pushCpuBattle, broadcast, send, pushLobby } = require('./state');
const { applyAtk, tickEffects, getStartState } = require('./battleEngine');
const { settleGauntletTiered, getPlayerStats, getPlayerRank, getTopPlayers, claimTowerGrandPrize, claimTowerTrainingWin, getHP } = require('./hp-balance');
const { cpuPickAttack } = require('./cpuAI');

const CPU_ID = -1;
const CPU_NAME = 'Zodiac Master';

async function endGauntlet(bId, playerId, won, defeatedCount = 0) {
  const b = battles.get(bId);
  const pl = lobby.get(playerId);
  if (!pl) return;
  
  const towerMode = b?.towerMode || (pl.isGuest ? 'guest' : 'hp');
  let newHp = 0;
  let reward = 0;
  let stats = { wins: 0, losses: 0, rank: null };
  let customMsg = '';
  let myXp = 0;

  try {
    if (won) {
      if (towerMode === 'hp') {
        // La función claimTowerGrandPrize ahora libera los 100 HP y paga los 1000 HP totales (900 reales de la plataforma)
        const claimed = await claimTowerGrandPrize(pl.wallet);
        if (claimed) {
          newHp = await getHP(pl.wallet);
          reward = 900; // Ganancia NETA real del jugador
          customMsg = '¡FELICIDADES! Eres el ganador del premio de 1000 HP. (Inversión 100 HP + Ganancia 900 HP).';
          broadcast({ type: 'chat_message', name: '⚔️ VICAMON', text: `🏆 ¡${pl.name} ha conquistado la Torre de Batalla y se lleva 1000 HP!` });
        } else {
          // Si el excedente ya no daba mientras jugaba, se le da la recompensa de escalar normal (200 HP -> +100 neto)
          const result = await settleGauntletTiered(pl.wallet, 12);
          newHp = result.newHp;
          reward = result.reward - 100; 
          customMsg = '¡Ganaste la torre! Pero el premio mayor ya no estaba disponible. Se te pagan 200 HP.';
        }
      } else if (towerMode === 'training') {
        const result = await claimTowerTrainingWin(pl.wallet);
        if (result.ok) {
          newHp = result.newHp;
          reward = 10;
          customMsg = '¡Ganaste 10 HP de bono por completar la Torre de Entrenamiento!';
        } else {
          customMsg = '¡Ganaste la torre! Pero el bono de entrenamiento ya no estaba disponible.';
        }
      } else if (towerMode === 'guest') {
        myXp = 100; 
        customMsg = '¡Ganaste la Torre! Si estuvieras jugando con tu wallet, te habrías llevado 1000 HP.';
      }
    } else {
      // Si pierde
      if (towerMode === 'hp') {
        const result = await settleGauntletTiered(pl.wallet, defeatedCount);
        newHp = result.newHp;
        reward = result.reward - 100; // Balance neto
        const dbStats = await getPlayerStats(pl.wallet);
        if (dbStats) { stats.wins = dbStats.wins; stats.losses = dbStats.losses; }
        stats.rank = await getPlayerRank(pl.wallet);
      } else {
        customMsg = 'Has sido derrotado en la Torre. ¡Vuelve a intentarlo!';
      }
    }
  } catch (error) {
    console.error("Error en endGauntlet:", error);
  }

  try {
    send(pl.ws, { 
      type:'battle_end', 
      won, 
      isGauntlet: true, 
      newHp, 
      reward, 
      defeated: won ? 12 : defeatedCount, 
      isGuest: towerMode === 'guest',
      myXp: myXp,
      stats,
      towerMode,
      customMsg
    });
  } catch (e) { console.error("Error al enviar fin de gauntlet:", e); }
  
  if (pl) pl.inBattle = false;
  battles.delete(bId);
  await pushLobby();
  
  if (towerMode === 'hp' && won) {
    try {
      const top = await getTopPlayers(3);
      broadcast({ type: 'leaderboard_update', top });
    } catch (e) {}
  }
}

async function checkGauntletCpuDeath(bId) {
  const b = battles.get(bId); if (!b) return false;
  const cpuSt = b.cpuIsP1 ? b.st1 : b.st2;
  const plSt  = b.cpuIsP1 ? b.st2 : b.st1;
  const plId  = b.cpuIsP1 ? b.p2id : b.p1id;
  
  if (cpuSt.hp <= 0) {
    b.turnId = -2; 
    pushCpuBattle(bId); 
    setTimeout(async () => {
      try {
        const bb = battles.get(bId); if (!bb) return;
        bb.gauntletIndex++;
        if (bb.gauntletIndex >= 12 || bb.gauntletIndex >= bb.gauntletTeam.length) {
          await endGauntlet(bId, plId, true, 12);
        } else {
          const pl = lobby.get(plId);
          if (!pl) return endGauntlet(bId, plId, false, bb.gauntletIndex);
          bb.cpuBeast = bb.gauntletTeam[bb.gauntletIndex];
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
    setTimeout(async () => {
      try { 
        const bb = battles.get(bId); 
        if (!bb) return;
        await endGauntlet(bId, plId, false, bb.gauntletIndex);
      } catch(e) { console.error("Gauntlet loss error:", e); }
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
    const idx = cpuPickAttack(cpuSt, plSt, b.cpuBeast);
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
