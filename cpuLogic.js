const BEASTS = require('./beasts.js');
const { lobby, battles, pushCpuBattle } = require('./state');
const { applyAtk, tickEffects, endBattle } = require('./battleEngine');
const { cpuPickAttack } = require('./cpuAI');

const CPU_ID = -1;

async function checkCpuDeath(bId) {
  const b = battles.get(bId); if (!b) return false;
  const cpuSt = b.cpuIsP1 ? b.st1 : b.st2;
  const plSt  = b.cpuIsP1 ? b.st2 : b.st1;
  const plId  = b.cpuIsP1 ? b.p2id : b.p1id;
  
  if (cpuSt.hp <= 0) { 
    await endBattle(bId, plId, CPU_ID, Math.max(0, plSt.hp), b.isLabSimulation); 
    return true; 
  }
  if (plSt.hp <= 0) { 
    await endBattle(bId, CPU_ID, plId, Math.max(0, cpuSt.hp), b.isLabSimulation); 
    return true; 
  }
  return false;
}

function scheduleCpuTurn(bId) {
  const b = battles.get(bId); if (!b || !b.isCpu || b.turnId !== CPU_ID) return;
  setTimeout(async () => { 
    const bb = battles.get(bId); if (!bb || bb.turnId !== CPU_ID) return; 
    await doCpuTurn(bId); 
  }, 1100 + Math.random() * 600);
}

async function doCpuTurn(bId) {
  const b = battles.get(bId); if (!b) return;
  const cpuSt = b.cpuIsP1 ? b.st1 : b.st2;
  const plSt  = b.cpuIsP1 ? b.st2 : b.st1;
  const plId  = b.cpuIsP1 ? b.p2id : b.p1id;
  const pl = lobby.get(plId); if (!pl) return;

  b.logs.push(...tickEffects(cpuSt));
  if (await checkCpuDeath(bId)) return;

  if (cpuSt.stun) { 
    cpuSt.stun = false; 
    b.logs.push({t: `Zodiac Master aturdido — pierde turno`, c: 'special'}); 
  } else if (cpuSt.recharge > 0) { 
    cpuSt.recharge--; 
    b.logs.push({t: `Zodiac Master recargando...`, c: 'special'}); 
  } else {
    const idx = cpuPickAttack(cpuSt, plSt, b.cpuBeast);
    const atk = BEASTS[b.cpuBeast].attacks[idx];
    if (cpuSt.pp[idx] < 99) cpuSt.pp[idx]--;
    b.logs.push(...applyAtk(cpuSt, plSt, atk, 'Zodiac Master'));
    if (await checkCpuDeath(bId)) return;
  }

  b.turnId = plId;
  pushCpuBattle(bId);

  const bb = battles.get(bId); if (!bb) return;
  const plStNow = b.cpuIsP1 ? bb.st2 : bb.st1;
  if (plStNow.stun || plStNow.recharge > 0) {
    setTimeout(async () => { 
      const bbb = battles.get(bId); if (!bbb || bbb.turnId !== plId) return; 
      await processCpuPlayerTurn(bId, plId, -1); 
    }, 900);
  }
}

async function processCpuPlayerTurn(bId, playerId, atkIndex) {
  const b = battles.get(bId); if (!b || !b.isCpu || b.turnId !== playerId) return;
  const plIsP1 = !b.cpuIsP1;
  const plSt = plIsP1 ? b.st1 : b.st2;
  const cpuSt = plIsP1 ? b.st2 : b.st1;
  const pl = lobby.get(playerId); if (!pl) return;

  b.logs.push(...tickEffects(plSt));
  if (await checkCpuDeath(bId)) return;

  if (plSt.stun) { 
    plSt.stun = false; 
    b.logs.push({t: `${pl.name} aturdido — pierde turno`, c: 'special'}); 
  } else if (plSt.recharge > 0) { 
    plSt.recharge--; 
    b.logs.push({t: `${pl.name} recargando...`, c: 'special'}); 
  } else if (atkIndex >= 0) {
    // FIX: Si es batalla de laboratorio, leemos los ataques del objeto customBeast
    const atks = b.customBeast ? b.customBeast.attacks : BEASTS[pl.beast]?.attacks;
    const atk = atks?.[atkIndex]; if (!atk) return;
    if (plSt.pp[atkIndex] <= 0) {
      b.logs.push({t: `${pl.name} intentó usar ${atk.n} pero no tiene PP. ¡Turno perdido!`, c: 'bad'});
      b.turnId = CPU_ID; pushCpuBattle(bId); scheduleCpuTurn(bId); return;
    }
    if (plSt.pp[atkIndex] < 99) plSt.pp[atkIndex]--;
    b.logs.push(...applyAtk(plSt, cpuSt, atk, pl.name));
    if (await checkCpuDeath(bId)) return;
  }
  
  b.turnId = CPU_ID; 
  pushCpuBattle(bId); 
  scheduleCpuTurn(bId);
}

module.exports = { CPU_ID, processCpuPlayerTurn, scheduleCpuTurn };
