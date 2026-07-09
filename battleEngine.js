const BEASTS = require('./beasts.js');
const { 
  settleMatch, getHP, updatePlayerStats, 
  getPlayerStats, getPlayerRank, getTopPlayers, 
  USDC_PER_HP 
} = require('./hp-balance');
const { lobby, battles, pushBattle, pushLobby, broadcast, walletToBattle } = require('./state');

function newState() {
  return { hp:100, maxHp:100, poisonDmg:0, poisonTurns:0, burnDmg:0, burnTurns:0,
    shield:0, shieldReflect:0, reflect50:0, stun:false, recharge:0,
    regen:0, regenTurns:0, blind:0, weakAtk:0, weaken:0,
    corrode:0, analyzed:0, lastDmgReceived:0, pp:[] };
}

function getStartState(beastKey) { 
  const st = newState(); 
  const beast = BEASTS[beastKey]; 
  if (beast) { 
    st.pp = beast.attacks.map(a => a.pp === undefined ? 99 : a.pp); 
  } else { 
    st.pp = [99, 99, 99, 99]; 
  } 
  return st; 
}

function applyAtk(aSt, dSt, atk, aName) { 
  const logs = []; 
  const blind = aSt.blind > 0 ? 30 : 0; 
  const weakMul = aSt.weakAtk > 0 ? 0.8 : 1; 
  const anaMul = aSt.analyzed > 0 ? 1.15 : 1; 
  const fx = atk.fx;
  
  if (fx==='shield2') { aSt.shield=2; aSt.shieldReflect=0; logs.push({t:`${aName} activa Escudo ×2`,c:'good'}); return logs; }
  if (fx==='shield1r') { aSt.shield=1; aSt.shieldReflect=15; logs.push({t:`${aName} activa Escudo Lunar`,c:'good'}); return logs; }
  if (fx==='reflect50'){ aSt.reflect50=1; logs.push({t:`${aName} prepara Reflejo 50%`,c:'good'}); return logs; }
  if (fx==='heal20') { aSt.hp=Math.min(aSt.maxHp,aSt.hp+20); logs.push({t:`${aName} se cura 20 HP`,c:'good'}); return logs; }
  if (fx==='heal30') { aSt.hp=Math.min(aSt.maxHp,aSt.hp+30); logs.push({t:`${aName} se cura 30 HP`,c:'good'}); return logs; }
  if (fx==='fortress') { aSt.shield=2; aSt.hp=Math.min(aSt.maxHp,aSt.hp+15); aSt.regen=6; aSt.regenTurns=2; logs.push({t:`${aName} activa Fortaleza`,c:'good'}); return logs; }
  if (fx==='analyze') { aSt.analyzed=3; logs.push({t:`${aName} analiza al rival`,c:'good'}); return logs; }
  if (fx==='purify') { aSt.poisonTurns=aSt.burnTurns=aSt.blind=aSt.weakAtk=aSt.weaken=0; aSt.stun=false; aSt.hp=Math.min(aSt.maxHp,aSt.hp+15); logs.push({t:`${aName} se purifica +15 HP`,c:'good'}); return logs; }
  if (fx==='weaken') { dSt.weaken=2; logs.push({t:`${aName} debilita al rival`,c:'special'}); return logs; }
  if (fx==='counter') { const h=aSt.lastDmgReceived||0; aSt.hp=Math.min(aSt.maxHp,aSt.hp+h); logs.push({t:`${aName} usa Contrapeso: +${h} HP`,c:'good'}); return logs; }
  
  if (fx==='swap') { 
    const propsToSwap = ['stun', 'poisonDmg', 'poisonTurns', 'burnDmg', 'burnTurns', 'blind', 'weakAtk', 'weaken', 'corrode'];
    propsToSwap.forEach(prop => {
      const temp = dSt[prop];
      dSt[prop] = aSt[prop];
      aSt[prop] = temp;
    });
    logs.push({t:`${aName} intercambia estados negativos con el rival`,c:'special'}); 
    return logs; 
  }

  if (fx==='equalize') { const diff=Math.abs(aSt.hp-dSt.hp); dSt.hp=Math.max(0,dSt.hp-diff); logs.push({t:`${aName} → Equilibrio: ${diff} HP`,c:'bad'}); return logs; }
  if (fx==='chaos'||fx==='chaosHi') { if (Math.random()*100 >= atk.acc-blind) { logs.push({t:`${aName} → ¡falló!`,c:'bad'}); return logs; } const dmg=fx==='chaosHi'?Math.floor(Math.random()*36)+10:Math.floor(Math.random()*36)+5; dSt.hp=Math.max(0,dSt.hp-dmg); logs.push({t:`${aName} → Caos: ${dmg} HP`,c:'bad'}); return logs; }
  
  const hit = Math.random()*100 < Math.max(5, atk.acc-blind);
  if (!hit) { if (fx==='overload') { aSt.hp=Math.max(0,aSt.hp-25); logs.push({t:`${aName} → Sobrecarga falló! -25 HP`,c:'bad'}); } else logs.push({t:`${aName} → ¡falló!`,c:'bad'}); return logs; }
  
  if (atk.d > 0 && !atk.pierce) {
    if (dSt.shield > 0) { dSt.shield--; const ref=dSt.shieldReflect||0; if (ref>0) { aSt.hp=Math.max(0,aSt.hp-ref); logs.push({t:`¡Escudo! Bloqueado — refleja ${ref} HP`,c:'special'}); } else logs.push({t:`¡Escudo! Ataque bloqueado`,c:'special'}); return logs; }
    if (dSt.reflect50 > 0) { dSt.reflect50=0; const ref=Math.floor(atk.d*0.5); aSt.hp=Math.max(0,aSt.hp-ref); logs.push({t:`¡Reflejo! Devuelve ${ref} HP`,c:'special'}); return logs; }
  }
  
  let dmg=atk.d;
  if (fx==='double') dmg=atk.d*2; if (fx==='triple') dmg=atk.d*3;
  if (fx==='drain10') { dmg=15; aSt.hp=Math.min(aSt.maxHp,aSt.hp+10); }
  if (fx==='selfheal10') aSt.hp=Math.min(aSt.maxHp,aSt.hp+10);
  if (fx==='shieldbonus' && dSt.shield>0) dmg+=10;
  if (fx==='weakbonus' && dSt.weaken>0) dmg+=10;
  if (fx==='stateBonus' && (dSt.poisonTurns>0||dSt.burnTurns>0||dSt.stun||dSt.blind>0)) dmg+=10;
  if (fx==='poisonBonus') dmg+=(dSt.poisonTurns||0)*5;
  if (fx==='poisonDouble'&&dSt.poisonTurns>0) dmg*=2;
  if (fx==='lowHPbonus' &&aSt.hp<dSt.hp) dmg+=10;
  if (fx==='lowHPx15' &&aSt.hp<aSt.maxHp*0.3) dmg=Math.floor(dmg*1.5);
  if (dSt.weaken>0) dmg=Math.floor(dmg*1.25);
  dmg=Math.floor(dmg*weakMul*anaMul);
  
  dSt.hp=Math.max(0,dSt.hp-dmg); dSt.lastDmgReceived=dmg; if (atk.self>0) aSt.hp=Math.max(0,aSt.hp-atk.self);
  
  let extra='';
  if (fx==='poison5') { dSt.poisonDmg=8; dSt.poisonTurns=5; }
  if (fx==='poison3l') { dSt.poisonDmg=3; dSt.poisonTurns=3; }
  if (fx==='corrode') { dSt.corrode=3; }
  if (fx==='burn') { dSt.burnDmg=6; dSt.burnTurns=2; }
  if (fx==='stun') { dSt.stun=true; }
  if (fx==='stun_blind') { dSt.stun=true; dSt.blind=2; }
  if (fx==='stun_ifless'&&dSt.hp>aSt.hp) { dSt.stun=true; }
  if (fx==='slow'||fx==='slow2') { dSt.blind=(fx==='slow2'?2:1); }
  if (fx==='blind') { dSt.blind=2; }
  if (fx==='weakAtk') { dSt.weakAtk=2; }
  if (fx==='recharge') { aSt.recharge=1; }
  if (fx==='random_fx') { const opts=['poison','stun','blind','weakAtk']; const r=opts[Math.floor(Math.random()*opts.length)]; if(r==='poison'){dSt.poisonDmg=5;dSt.poisonTurns=3;} if(r==='stun'){dSt.stun=true;} if(r==='blind'){dSt.blind=2;} if(r==='weakAtk'){dSt.weakAtk=2;} }
  
  const selfNote=atk.self>0?` (-${atk.self} propio)`:''; 
  const healNote=fx==='drain10'?' (drena 10)':fx==='selfheal10'?' (+10 propio)':'';
  logs.push({t:`${aName} → ${dmg} HP${selfNote}${healNote}${extra}`,c:dmg>25?'bad':'normal'});
  return logs;
}

function tickEffects(st) {
  const logs=[];
  if (st.poisonTurns>0){ st.hp=Math.max(0,st.hp-st.poisonDmg); st.poisonTurns--; logs.push({t:`Veneno`,c:'special'}); }
  if (st.burnTurns>0) { st.hp=Math.max(0,st.hp-st.burnDmg); st.burnTurns--; logs.push({t:`Quema`,c:'special'}); }
  if (st.regenTurns>0){ st.hp=Math.min(st.maxHp,st.hp+st.regen); st.regenTurns--; logs.push({t:`Regen`,c:'good'}); }
  if (st.blind>0) st.blind--; if (st.weakAtk>0) st.weakAtk--; if (st.weaken>0) st.weaken--; if (st.corrode>0) st.corrode--; if (st.analyzed>0) st.analyzed--;
  return logs;
}

async function endBattle(bId, winnerId, loserId, winnerHp, forfeit=false) {
  const b = battles.get(bId);
  const isCpu = b?.isCpu || false;
  const isTraining = b?.isTraining || false;
  const isLabSimulation = b?.isLabSimulation || false; // NUEVO
  const winner = lobby.get(winnerId);
  const loser = lobby.get(loserId);
  const hp = forfeit ? 100 : Math.max(0, Math.min(100, winnerHp));

  // NUEVO: Si es simulación del laboratorio, no tocar DB ni HP, solo avisar al frontend
  if (isLabSimulation) {
    if(winner) winner.ws.send(JSON.stringify({ type:'battle_end', won:true, isCpu:true, isTraining:true, isLabSimulation:true, winnerXp:0, loserXp:0 }));
    if(loser) loser.ws.send(JSON.stringify({ type:'battle_end', won:false, isCpu:true, isTraining:true, isLabSimulation:true, winnerXp:0, loserXp:0 }));
    if (winner) winner.inBattle = false;
    if (loser) loser.inBattle = false;
    battles.delete(bId);
    await pushLobby();
    return;
  }

  if (isTraining) {
    const winnerXp = forfeit ? 0 : 100 + Math.max(0, Math.min(100, winnerHp));
    const loserXp = 0;
    if(winner) winner.ws.send(JSON.stringify({ type:'battle_end', won:true, isTraining:true, isCpu:false, winnerXp, loserXp, forfeit }));
    if(loser) loser.ws.send(JSON.stringify({ type:'battle_end', won:false, isTraining:true, isCpu:false, winnerXp, loserXp }));
  } else if (isCpu) {
    const winnerXp = forfeit ? 0 : 100 + Math.max(0, Math.min(100, winnerHp));
    if(winner) winner.ws.send(JSON.stringify({ type:'battle_end', won:true, isCpu:true, isTraining:false, winnerXp, loserXp:0, winnerHp:hp, forfeit }));
    if(loser) loser.ws.send(JSON.stringify({ type:'battle_end', won:false, isCpu:true, isTraining:false, winnerXp, loserXp:0, winnerHp:hp }));
  } else {
    const winnerWallet = winner?.wallet || '';
    const loserWallet = loser?.wallet || '';
    const result = await settleMatch(winnerWallet, loserWallet, hp);
    await updatePlayerStats(winnerWallet, loserWallet);
    const wStats = await getPlayerStats(winnerWallet);
    const lStats = await getPlayerStats(loserWallet);
    const wRank = await getPlayerRank(winnerWallet);
    const lRank = await getPlayerRank(loserWallet);
    const winnerUsdc = parseFloat(((100 + hp) * USDC_PER_HP).toFixed(3));
    const platformUsdc = parseFloat(((100 - hp) * USDC_PER_HP).toFixed(3));
    if(winner) winner.ws.send(JSON.stringify({ type:'battle_end', won:true, isCpu:false, isTraining:false, winnerHp:hp, winnerUsdc, platformUsdc, newHp: result.winnerNewHp, forfeit, stats: { wins: wStats.wins, losses: wStats.losses, rank: wRank } }));
    if(loser) loser.ws.send(JSON.stringify({ type:'battle_end', won:false, isCpu:false, isTraining:false, winnerHp:hp, winnerUsdc, platformUsdc, newHp: await getHP(loserWallet), stats: { wins: lStats.wins, losses: lStats.losses, rank: lRank } }));
    const top = await getTopPlayers(3);
    broadcast({ type: 'leaderboard_update', top });
  }
  if (winner) winner.inBattle=false;
  if (loser) loser.inBattle=false;

  // Limpiar mapa de reconexión al terminar batalla
  if (b && b.p1Wallet) walletToBattle.delete(b.p1Wallet);
  if (b && b.p2Wallet) walletToBattle.delete(b.p2Wallet);

  battles.delete(bId);
  await pushLobby();
}

async function checkDeath(bId, isP1Attacker) {
  const b=battles.get(bId); if (!b) return false;
  const aSt=isP1Attacker?b.st1:b.st2;
  const dSt=isP1Attacker?b.st2:b.st1;
  const aId=isP1Attacker?b.p1id:b.p2id;
  const dId=isP1Attacker?b.p2id:b.p1id;
  if (dSt.hp<=0) { await endBattle(bId,aId,dId,Math.max(0,aSt.hp)); return true; }
  if (aSt.hp<=0) { await endBattle(bId,dId,aId,0); return true; }
  return false;
}

async function processTurn(bId, attackerId, atkIndex) {
  const b=battles.get(bId); if (!b) return true;
  if (b.turnId !== attackerId) return false;
  const isP1 = b.p1id===attackerId;
  const aSt = isP1 ? b.st1 : b.st2;
  const dSt = isP1 ? b.st2 : b.st1;
  const aPlayer= lobby.get(attackerId);
  const dPlayer= lobby.get(isP1 ? b.p2id : b.p1id);
  if (!aPlayer||!dPlayer) return true;

  b.logs.push(...tickEffects(aSt));
  if (await checkDeath(bId, isP1)) return true;

  if (aSt.stun) {
    aSt.stun=false; b.logs.push({t:`${aPlayer.name} aturdido — pierde turno`,c:'special'});
  } else if (aSt.recharge>0) {
    aSt.recharge--; b.logs.push({t:`${aPlayer.name} recargando...`,c:'special'});
  } else if (atkIndex >= 0) {
    const atks=BEASTS[aPlayer.beast]?.attacks;
    const atk=atks?.[atkIndex];
    if (!atk) return false;
    if (aSt.pp[atkIndex] <= 0) {
      b.logs.push({t:`${aPlayer.name} intentó usar ${atk.n} pero no tiene PP. ¡Turno perdido!`,c:'bad'});
      b.turnId = isP1 ? b.p2id : b.p1id; pushBattle(bId); autoResolveIfBlocked(bId); return false;
    }
    if (aSt.pp[atkIndex] < 99) aSt.pp[atkIndex]--;
    b.logs.push(...applyAtk(aSt,dSt,atk,aPlayer.name));
    if (await checkDeath(bId, isP1)) return true;
  }
  b.turnId = isP1 ? b.p2id : b.p1id;
  pushBattle(bId); autoResolveIfBlocked(bId);
  return false;
}

function autoResolveIfBlocked(bId) {
  const b=battles.get(bId); if (!b) return;
  const currentId=b.turnId;
  const currentSt=b.p1id===currentId ? b.st1 : b.st2;
  if (currentSt.stun || currentSt.recharge>0) {
    setTimeout(async () => {
      const bb=battles.get(bId); if (!bb||bb.turnId!==currentId) return;
      await processTurn(bId, currentId, -1);
    }, 900);
  }
}

module.exports = {
  newState, getStartState, applyAtk, tickEffects, 
  endBattle, checkDeath, processTurn, autoResolveIfBlocked
};
