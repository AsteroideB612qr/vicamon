const BEASTS = global.BEASTS_DB || require('./beasts.js');
const { getStartState, applyAtk, tickEffects } = require('./battleEngine');
const { cpuPickAttack } = require('./cpuAI');

function simulateBattle(b1Key, b2Key) {
    let st1 = getStartState(b1Key);
    let st2 = getStartState(b2Key);
    
    let attacker = 1; // 1 para st1, 2 para st2
    let turn = 0;
    
    while (turn < 50) { // Límite de 50 turnos para evitar bucles infinitos
        turn++;
        let aSt = attacker === 1 ? st1 : st2;
        let dSt = attacker === 1 ? st2 : st1;
        let bKey = attacker === 1 ? b1Key : b2Key;
        
        // Aplicar efectos de turno (veneno, quemadura, etc)
        tickEffects(aSt, "Bot");
        if (aSt.hp <= 0) return attacker === 1 ? 2 : 1; // Gana el defensor
        
        // Lógica de ataque
        if (aSt.stun) { 
            aSt.stun = false; 
        } else if (aSt.recharge > 0) { 
            aSt.recharge--; 
        } else {
            const idx = cpuPickAttack(aSt, dSt, bKey);
            const atk = BEASTS[bKey].attacks[idx];
            if (aSt.pp[idx] < 99) aSt.pp[idx]--;
            applyAtk(aSt, dSt, atk, "Bot1", "Bot2");
            
            if (dSt.hp <= 0) return attacker; // Gana el atacante
        }
        
        attacker = attacker === 1 ? 2 : 1; // Cambio de turno
    }
    return 0; // Empate por límite de turnos
}

async function runMetaSimulation() {
    const keys = Object.keys(BEASTS);
    const stats = {};
    keys.forEach(k => stats[k] = { wins: 0, losses: 0, draws: 0 });

    // Todos contra todos (Round Robin)
    for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
            // Batalla 1: i vs j
            let winner = simulateBattle(keys[i], keys[j]);
            if (winner === 1) { stats[keys[i]].wins++; stats[keys[j]].losses++; }
            else if (winner === 2) { stats[keys[j]].wins++; stats[keys[i]].losses++; }
            else { stats[keys[i]].draws++; stats[keys[j]].draws++; }
            
            // Batalla 2: j vs i (Para ser justos con quién ataca primero)
            winner = simulateBattle(keys[j], keys[i]);
            if (winner === 1) { stats[keys[j]].wins++; stats[keys[i]].losses++; }
            else if (winner === 2) { stats[keys[i]].wins++; stats[keys[j]].losses++; }
            else { stats[keys[i]].draws++; stats[keys[j]].draws++; }
        }
    }
    
    // Calcular Win Rate y ordenar
    const results = Object.entries(stats).map(([key, s]) => {
        const total = s.wins + s.losses + s.draws;
        const winRate = total > 0 ? ((s.wins / total) * 100).toFixed(1) : 0;
        return { key, name: BEASTS[key].name, wins: s.wins, losses: s.losses, draws: s.draws, winRate: parseFloat(winRate) };
    }).sort((a, b) => b.winRate - a.winRate);

    return results;
}

module.exports = { runMetaSimulation };
