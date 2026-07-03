const BEASTS = require('./beasts.js');
const { lobby, battles, send, broadcast, pushLobby } = require('./state');
const { applyAtk, tickEffects, getStartState } = require('./battleEngine');
const { settleTeamMatch, updatePlayerStats, getPlayerStats, getPlayerRank, getTopPlayers } = require('./hp-balance');
const { cpuPickAttack } = require('./cpuAI');

const CPU_ID = -1;
const CPU_NAME = 'Zodiac Master';

function pushTeamBattle(bId) {
  const b = battles.get(bId); if (!b) return;
  const p1 = lobby.get(b.p1id), p2 = lobby.get(b.p2id);
  if (!p1 || !p2) return;
  const formatSide = (player, teamStates, activeIdx) => {
    return { name: player.name, activeBeast: player.team[activeIdx], activeState: teamStates[activeIdx], bench: player.team.map((beastKey, i) => ({ beast: beastKey, state: teamStates[i], isDead: teamStates[i].hp <= 0, isActive: i === activeIdx })) };
  };
  const p1Side = formatSide(p1, b.team1, b.active1);
  const p2Side = formatSide(p2, b.team2, b.active2);
  const base = { type: 'battle_state', battleId: bId, p1: p1Side, p2: p2Side, logs: b.logs.slice(-14), isTeamBattle: true };
  send(p1.ws, { ...base, yourTurn: b.turnId === b.p1id });
  send(p2.ws, { ...base, yourTurn: b.turnId === b.p2id });
}

function pushTeamCpuBattle(bId) {
  const b = battles.get(bId); if (!b) return;
  const pl = lobby.get(b.p2id); if (!pl) return;
  const cpuTeam = b.team1; const plTeam = b.team2; const activeCpu = b.active1; const activePl = b.active2;
  const cpuSide = { name: CPU_NAME, activeBeast: b.cpuTeam[activeCpu], activeState: cpuTeam[activeCpu], bench: b.cpuTeam.map((beastKey, i) => ({ beast: beastKey, state: cpuTeam[i], isDead: cpuTeam[i].hp <= 0, isActive: i === activeCpu })) };
  const plSide = { name: pl.name, activeBeast: pl.team[activePl], activeState: plTeam[activePl], bench: pl.team.map((beastKey, i) => ({ beast: beastKey, state: plTeam[i], isDead: plTeam[i].hp <= 0, isActive: i === activePl })) };
  send(pl.ws, { type: 'battle_state', battleId: bId, p1: cpuSide, p2: plSide, logs: b.logs.slice(-14), isTeamBattle: true, yourTurn: b.turnId !== CPU_ID });
}

// NUEVO: Función mágica que desbloquea el juego si alguien está aturdido o recargando
function autoResolveTeamIfBlocked(bId) {
  const b = battles.get(bId); if (!b) return;
  const currentId = b.turnId;
  // Si es turno de la IA, de pausa por muerte o pausa por torre, no hacer nada
  if (currentId === CPU_ID || currentId === -4 || currentId === -2) return; 

  const isP1 = b.p1id === currentId;
  const currentSt = isP1 ? b.team1[b.active1] : b.team2[b.active2];
  const isCpu = b.isTeamCpu;

  if (currentSt.stun || currentSt.recharge > 0) {
    setTimeout(async () => {
      const bb = battles.get(bId); if (!bb || bb.turnId !== currentId) return;
      if (isCpu) {
        await processTeamCpuPlayerTurn(bId, currentId, -1);
      } else {
        await processTeamTurn(bId, currentId, -1);
      }
    }, 900);
  }
}

async function endTeamBattle(bId, winnerId, loserId, winnerRemainingHp) {
  const b = battles.get(bId);
  const isTraining = b?.isTeamTraining || false;
  const isCpu = b?.isTeamCpu || false;
  const winner = lobby.get(winnerId);
  const loser = lobby.get(loserId);
  const hp = Math.max(0, Math.min(300, winnerRemainingHp));
  
  if (isTraining || isCpu) {
    let winnerXp = 300 + hp; 
    let loserXp = 0;
    if(winner) winner.ws.send(JSON.stringify({ type:'battle_end', won:true, isTeamBattle:true, isTraining:true, winnerXp, loserXp }));
    if(loser) loser.ws.send(JSON.stringify({ type:'battle_end', won:false, isTeamBattle:true, isTraining:true, winnerXp, loserXp }));
  } else {
    const winnerWallet = winner?.wallet || '';
    const loserWallet = loser?.wallet || '';
    const result = await settleTeamMatch(winnerWallet, loserWallet, hp);
    await updatePlayerStats(winnerWallet, loserWallet);
    const wStats = await getPlayerStats(winnerWallet);
    const lStats = await getPlayerStats(loserWallet);
    const wRank = await getPlayerRank(winnerWallet);
    const lRank = await getPlayerRank(loserWallet);
    if(winner) winner.ws.send(JSON.stringify({ type:'battle_end', won:true, isTeamBattle:true, winnerHp:hp, newHp: result.winnerNewHp, stats: { wins: wStats.wins, losses: wStats.losses, rank: wRank } }));
    if(loser) loser.ws.send(JSON.stringify({ type:'battle_end', won:false, isTeamBattle:true, winnerHp:hp, newHp: 0, stats: { wins: lStats.wins, losses: lStats.losses, rank: lRank } }));
    const top = await getTopPlayers(3);
    broadcast({ type: 'leaderboard_update', top });
  }
  if (winner) winner.inBattle = false;
  if (loser) loser.inBattle = false;
  battles.delete(bId);
  await pushLobby();
}

async function checkTeamDeath(bId, isP1Attacker, isCpu) {
  const b = battles.get(bId); if (!b) return false;
  const aSt = isP1Attacker ? b.team1[b.active1] : b.team2[b.active2];
  const dSt = isP1Attacker ? b.team2[b.active2] : b.team1[b.active1];
  const aId = isP1Attacker ? b.p1id : b.p2id;
  const dId = isP1Attacker ? b.p2id : b.p1id;
  const aPlayer = lobby.get(aId);
  const dPlayer = lobby.get(dId);

  if (dSt.hp <= 0) {
    const defenderTeam = isP1Attacker ? b.team2 : b.team1;
    const defenderActive = isP1Attacker ? b.active2 : b.active1;
    const livingBench = [];
    defenderTeam.forEach((st, i) => { if (i !== defenderActive && st.hp > 0) livingBench.push(i); });

    if (livingBench.length === 0) {
      const winnerRemainingHp = (isP1Attacker ? b.team1 : b.team2).reduce((sum, st) => sum + Math.max(0, st.hp), 0);
      await endTeamBattle(bId, aId, dId, winnerRemainingHp);
      return true;
    } else {
      b.turnId = -4; 
      const defenderIsCpu = isCpu && !isP1Attacker; 
      if (defenderIsCpu) {
        b.active1 = livingBench[0]; 
        b.logs.push({t: `${CPU_NAME} cambia a ${BEASTS[b.cpuTeam[b.active1]].name}`, c: 'special'});
        b.turnId = b.p2id; 
        pushTeamCpuBattle(bId);
      } else {
        if(isCpu) pushTeamCpuBattle(bId); else pushTeamBattle(bId);
        if (dPlayer && dPlayer.ws) {
          send(dPlayer.ws, { type: 'team_force_switch', battleId: bId, reason: '¡Tu Vicamon fue derrotado! Elige el siguiente.' });
        }
      }
      return true;
    }
  }

  if (aSt.hp <= 0) {
    const attackerTeam = isP1Attacker ? b.team1 : b.team2;
    const attackerActive = isP1Attacker ? b.active1 : b.active2;
    const livingBench = [];
    attackerTeam.forEach((st, i) => { if (i !== attackerActive && st.hp > 0) livingBench.push(i); });

    if (livingBench.length === 0) {
      const winnerRemainingHp = (isP1Attacker ? b.team2 : b.team1).reduce((sum, st) => sum + Math.max(0, st.hp), 0);
      await endTeamBattle(bId, dId, aId, winnerRemainingHp);
      return true;
    } else {
      b.turnId = -4;
      const attackerIsCpu = isCpu && isP1Attacker; 
      if (attackerIsCpu) {
        b.active1 = livingBench[0];
        b.logs.push({t: `${CPU_NAME} cambia a ${BEASTS[b.cpuTeam[b.active1]].name}`, c: 'special'});
        b.turnId = b.p2id; 
        pushTeamCpuBattle(bId);
      } else {
        if(isCpu) pushTeamCpuBattle(bId); else pushTeamBattle(bId);
        if (aPlayer && aPlayer.ws) {
          send(aPlayer.ws, { type: 'team_force_switch', battleId: bId, reason: '¡Tu Vicamon fue derrotado! Elige el siguiente.' });
        }
      }
      return true;
    }
  }
  return false;
}

async function processTeamTurn(bId, attackerId, atkIndex) {
  const b = battles.get(bId); if (!b) return true;
  if (b.turnId !== attackerId) return false;
  const isP1 = b.p1id === attackerId;
  const aSt = isP1 ? b.team1[b.active1] : b.team2[b.active2];
  const dSt = isP1 ? b.team2[b.active2] : b.team1[b.active1];
  const aPlayer = lobby.get(attackerId);
  const dPlayer = lobby.get(isP1 ? b.p2id : b.p1id);
  if (!aPlayer || !dPlayer) return true;

  b.logs.push(...tickEffects(aSt));
  if (await checkTeamDeath(bId, isP1, false)) return true;

  if (aSt.stun) { aSt.stun = false; b.logs.push({t: `${aPlayer.name} aturdido — pierde turno`, c: 'special'}); } 
  else if (aSt.recharge > 0) { aSt.recharge--; b.logs.push({t: `${aPlayer.name} recargando...`, c: 'special'}); } 
  else if (atkIndex >= 0) {
    const atkKey = isP1 ? aPlayer.team[b.active1] : aPlayer.team[b.active2];
    const atk = BEASTS[atkKey]?.attacks[atkIndex];
    if (!atk) return false;
    if (aSt.pp[atkIndex] <= 0) {
      b.logs.push({t: `${aPlayer.name} intentó usar ${atk.n} pero no tiene PP. ¡Turno perdido!`, c: 'bad'});
      b.turnId = isP1 ? b.p2id : b.p1id; pushTeamBattle(bId); autoResolveTeamIfBlocked(bId); return false;
    }
    if (aSt.pp[atkIndex] < 99) aSt.pp[atkIndex]--;
    b.logs.push(...applyAtk(aSt, dSt, atk, BEASTS[atkKey].name));
    if (await checkTeamDeath(bId, isP1, false)) return true;
  }
  b.turnId = isP1 ? b.p2id : b.p1id;
  pushTeamBattle(bId);
  autoResolveTeamIfBlocked(bId);
  return false;
}

async function doTeamCpuTurn(bId) {
  const b = battles.get(bId); if (!b) return;
  const cpuSt = b.team1[b.active1];
  const plSt  = b.team2[b.active2];
  const plId  = b.p2id;
  const pl = lobby.get(plId); if (!pl) return;

  b.logs.push(...tickEffects(cpuSt));
  if (await checkTeamDeath(bId, true, true)) return; 

  if (cpuSt.stun) { cpuSt.stun = false; b.logs.push({t: `${CPU_NAME} aturdido — pierde turno`, c: 'special'}); } 
  else if (cpuSt.recharge > 0) { cpuSt.recharge--; b.logs.push({t: `${CPU_NAME} recargando...`, c: 'special'}); } 
  else {
    const idx = cpuPickAttack(cpuSt, plSt, b.cpuTeam[b.active1]);
    const atk = BEASTS[b.cpuTeam[b.active1]].attacks[idx];
    if (cpuSt.pp[idx] < 99) cpuSt.pp[idx]--;
    b.logs.push(...applyAtk(cpuSt, plSt, atk, BEASTS[b.cpuTeam[b.active1]].name));
    if (await checkTeamDeath(bId, true, true)) return;
  }

  b.turnId = plId;
  pushTeamCpuBattle(bId);
  autoResolveTeamIfBlocked(bId);
}

async function processTeamCpuPlayerTurn(bId, playerId, atkIndex) {
  const b = battles.get(bId); if (!b || b.turnId !== playerId) return;
  const plSt = b.team2[b.active2];
  const cpuSt = b.team1[b.active1];
  const pl = lobby.get(playerId); if (!pl) return;

  b.logs.push(...tickEffects(plSt));
  if (await checkTeamDeath(bId, false, true)) return;

  if (plSt.stun) { plSt.stun = false; b.logs.push({t: `${pl.name} aturdido — pierde turno`, c: 'special'}); } 
  else if (plSt.recharge > 0) { plSt.recharge--; b.logs.push({t: `${pl.name} recargando...`, c: 'special'}); } 
  else if (atkIndex >= 0) {
    const atkKey = pl.team[b.active2];
    const atk = BEASTS[atkKey]?.attacks[atkIndex]; if (!atk) return;
    if (plSt.pp[atkIndex] <= 0) {
      b.logs.push({t: `${pl.name} intentó usar ${atk.n} pero no tiene PP. ¡Turno perdido!`, c: 'bad'});
      b.turnId = CPU_ID; pushTeamCpuBattle(bId); 
      setTimeout(() => doTeamCpuTurn(bId), 1000);
      return;
    }
    if (plSt.pp[atkIndex] < 99) plSt.pp[atkIndex]--;
    b.logs.push(...applyAtk(plSt, cpuSt, atk, BEASTS[atkKey].name));
    if (await checkTeamDeath(bId, false, true)) return;
  }
  b.turnId = CPU_ID; 
  pushTeamCpuBattle(bId);
  setTimeout(() => doTeamCpuTurn(bId), 1000);
}

async function processTeamSwitch(bId, playerId, switchToIndex) {
  const b = battles.get(bId); if (!b) return;
  if (b.turnId !== -4 && b.turnId !== playerId) {
    const player = lobby.get(playerId);
    if (player) send(player.ws, { type: 'error', msg: 'No es tu turno para cambiar.' });
    return;
  }
  const isP1 = b.p1id === playerId;
  const isCpu = b.isTeamCpu;
  const player = lobby.get(playerId);
  const team = isP1 ? b.team1 : b.team2;
  if (switchToIndex < 0 || switchToIndex >= team.length) return;
  if (team[switchToIndex].hp <= 0) {
    send(player.ws, { type: 'error', msg: 'Ese Vicamon está debilitado.' });
    return;
  }
  if (isP1) b.active1 = switchToIndex; else b.active2 = switchToIndex;
  const beastName = BEASTS[player.team[switchToIndex]].name;
  b.logs.push({t: `${player.name} cambia a ${beastName}`, c: 'special'});
  if(isCpu) {
    b.turnId = CPU_ID;
    pushTeamCpuBattle(bId);
    setTimeout(() => doTeamCpuTurn(bId), 1000);
  } else {
    b.turnId = isP1 ? b.p2id : b.p1id;
    pushTeamBattle(bId);
  }
}

module.exports = { 
  pushTeamBattle, pushTeamCpuBattle,
  processTeamTurn, processTeamSwitch,
  processTeamCpuPlayerTurn,
  doTeamCpuTurn,
  endTeamBattle
};
