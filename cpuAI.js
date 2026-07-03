const BEASTS = require('./beasts.js');

// El cerebro unificado de la IA. Si necesitas ajustar la dificultad, solo cambias este archivo.
function cpuPickAttack(cpuSt, oppSt, beastKey) {
  const atks = BEASTS[beastKey]?.attacks || [];
  const validIndices = []; const weights = [];
  
  atks.forEach((a, i) => {
    if (cpuSt.pp[i] > 0 || cpuSt.pp[i] === undefined || cpuSt.pp[i] === 99) {
      validIndices.push(i); 
      let s = 2; // Peso base
      if (a.d > 30 && oppSt.hp < 40) s = 5; // Rematar
      if ((a.fx === 'poison5' || a.fx === 'poison3l') && oppSt.poisonTurns === 0 && oppSt.hp > 40) s = 4;
      if ((a.fx === 'heal20' || a.fx === 'heal30' || a.fx === 'fortress') && cpuSt.hp < 35) s = 5;
      if ((a.fx === 'shield2' || a.fx === 'shield1r') && cpuSt.hp < 45 && cpuSt.shield === 0) s = 4;
      if (a.fx === 'poisonDouble' && oppSt.poisonTurns > 0) s = 6;
      if (a.fx === 'recharge' && cpuSt.recharge === 0 && oppSt.hp > 60) s = 1;
      weights.push(s);
    }
  });
  
  if (validIndices.length === 0) return 0;
  const tot = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * tot, idx = validIndices[0];
  for (let i = 0; i < validIndices.length; i++) { 
    r -= weights[i]; 
    if (r <= 0) { idx = validIndices[i]; break; } 
  }
  return idx;
}

module.exports = { cpuPickAttack };
