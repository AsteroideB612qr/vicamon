const { lobby, battles, walletToBattle, activePhysicalCodes, uid, send, broadcast, pushLobby, pushBattle, pushCpuBattle } = require('./state');
const { getStartState, processTurn, endBattle } = require('./battleEngine');
const { CPU_ID, processCpuPlayerTurn, scheduleCpuTurn } = require('./cpuLogic');
const { processGauntletPlayerTurn, endGauntlet, scheduleGauntletCpuTurn } = require('./gauntletManager');
const { pushTeamBattle, processTeamTurn, processTeamSwitch, processTeamCpuPlayerTurn, endTeamBattle } = require('./teamEngine');
const { getHP, addHP, hasHP, lockHP, unlockHP, settleMatch, cashout, updatePlayerName, updatePlayerStats, getTopPlayers, getPlayerStats, getPlayerRank, PLATFORM_WALLET, USDC_PER_HP, settleGauntletTiered } = require('./hp-balance');
const { sendUSDC } = require('./transfer');
const BEASTS = require('./beasts.js');
const BEAST_KEYS = Object.keys(BEASTS);
const ZODIAC_KEYS = Object.entries(BEASTS).filter(([k, b]) => b.cat === 'Zodiaco').map(([k]) => k);
const { PHYSICAL_CODES } = require('./physical-codes');

const ADMIN_PASS = process.env.ADMIN_PASSWORD || process.env.INTERNAL_SECRET || '';
const OWNER_WALLET = process.env.OWNER_WALLET || ''; 

function handleDcAutoSkip(bId) {
  const b = battles.get(bId);
  if (!b || !b.dcPlayerId) return;
  clearTimeout(b.dcTurnTimer);
  if (b.turnId === b.dcPlayerId) {
    b.dcTurnTimer = setTimeout(async () => {
      const currentB = battles.get(bId);
      if (currentB && currentB.dcPlayerId && currentB.turnId === currentB.dcPlayerId) {
        if (currentB.isTeamBattle) await processTeamTurn(bId, currentB.dcPlayerId, -1);
        else await processTurn(bId, currentB.dcPlayerId, -1);
      }
    }, 15000);
  }
}

function setupWebSocketServer(wss, getPlatformUSDCBalance) {
  wss.on('connection', ws => {
    const id = uid();

    ws.on('message', async raw => {
      let msg; try { msg = JSON.parse(raw); } catch { return; }
      try {
        if (msg.type === 'join') { const wallet = msg.wallet || ''; const isGuest = msg.isGuest || wallet.startsWith('guest_'); if (!isGuest && walletToBattle.has(wallet)) { const bId = walletToBattle.get(wallet); const b = battles.get(bId); if (b) { clearTimeout(b.dcTimer); clearTimeout(b.dcTurnTimer); b.dcPlayerId = null; b.dcWallet = null; for (const [oldId, p] of lobby) { if (p.wallet === wallet && oldId !== id) { lobby.delete(oldId); try { p.ws.close(); } catch(e) {} } } const isP1 = b.p1Wallet === wallet; const oldId = isP1 ? b.p1id : b.p2id; if (isP1) b.p1id = id; else b.p2id = id; if (b.turnId === oldId) b.turnId = id; lobby.set(id, { ws, name: msg.name, beast: isP1 ? b.p1Beast : b.p2Beast, wallet, inBattle: true, id, isGuest: false, physicalBeasts: p.physicalBeasts || [] }); const oppId = isP1 ? b.p2id : b.p1id; const opp = lobby.get(oppId); if (opp) send(opp.ws, { type: 'opponent_reconnected' }); if (b.isTeamBattle) { send(ws, { type: 'reconnect_battle', battleId: bId, role: isP1 ? 'p1' : 'p2', id: id, isTeamBattle: true, opponent: opp?.name || 'Rival', yourTurn: b.turnId === id, myBeast: isP1 ? b.p1Beast : b.p2Beast, oppBeast: isP1 ? b.p2Beast : b.p1Beast }); setTimeout(() => pushTeamBattle(bId), 200); } else { send(ws, { type: 'reconnect_battle', battleId: bId, role: isP1 ? 'p1' : 'p2', id: id, isTeamBattle: false, opponent: opp?.name || 'Rival', yourTurn: b.turnId === id, myBeast: isP1 ? b.p1Beast : b.p2Beast, oppBeast: isP1 ? b.p2Beast : b.p1Beast }); setTimeout(() => pushBattle(bId), 200); } await pushLobby(); return; } else { walletToBattle.delete(wallet); } } for (const [oldId, p] of lobby) { if (p.wallet === wallet && oldId !== id) { send(p.ws, { type: 'kicked', msg: 'Tu wallet se conectó en otra pestaña.' }); if (!p.inBattle) lobby.delete(oldId); try { p.ws.close(); } catch(e) {} } } lobby.set(id, { ws, name: msg.name, beast: msg.beast, wallet, inBattle: false, id, isGuest, physicalBeasts: [] }); if (isGuest) { send(ws, { type: 'joined', id, hp: 0, isGuest: true, stats: { wins: 0, losses: 0, rank: null }, physicalBeasts: [] }); } else { await updatePlayerName(wallet, msg.name); const hp = await getHP(wallet); const stats = await getPlayerStats(wallet); const rank = await getPlayerRank(wallet); send(ws, { type: 'joined', id, hp, isGuest: false, stats: { wins: stats.wins, losses: stats.losses, rank }, physicalBeasts: [] }); const top = await getTopPlayers(3); send(ws, { type: 'leaderboard_update', top }); } await pushLobby(); }
        if (msg.type === 'change_beast') { const p = lobby.get(id); if (p && !p.inBattle) { p.beast = msg.beast; await pushLobby(); } }
        if (msg.type === 'update_nickname') { const p = lobby.get(id); if (p) { p.name = msg.name; if (!p.isGuest) await updatePlayerName(p.wallet, msg.name); await pushLobby(); send(ws, { type: 'nickname_updated', name: msg.name }); } }
        if (msg.type === 'redeem_physical_code') { const p = lobby.get(id); if (!p) return; if (p.isGuest) { send(ws, { type: 'error', msg: 'Conecta tu wallet para usar códigos físicos.' }); return; } const code = (msg.code || '').toUpperCase().trim(); if (!PHYSICAL_CODES[code]) { send(ws, { type: 'error', msg: 'Código inválido. Verifica tu llavero.' }); return; } if (activePhysicalCodes.has(code) && activePhysicalCodes.get(code) !== p.wallet) { send(ws, { type: 'error', msg: '¡Este Vicamon ya está en uso por otro entrenador!' }); return; } const beastKey = PHYSICAL_CODES[code]; if (p.physicalBeasts.includes(beastKey)) { send(ws, { type: 'error', msg: 'Ya tienes a este Vicamon invocado.' }); return; } p.physicalBeasts.push(beastKey); activePhysicalCodes.set(code, p.wallet); send(ws, { type: 'physical_code_success', beast: beastKey, code: code }); await pushLobby(); }
        if (msg.type === 'challenge') { const challenger = lobby.get(id); const target = lobby.get(msg.targetId); if (!challenger || !target || target.inBattle || challenger.inBattle) return; if (challenger.isGuest || target.isGuest) { send(ws, { type: 'error', msg: 'Los invitados solo pueden entrenar.' }); return; } const challengerHP = await getHP(challenger.wallet); const targetHP = await getHP(target.wallet); if (challengerHP < 100) { send(ws, { type: 'error', msg: `Necesitas 100 HP.` }); return; } if (targetHP < 100) { send(ws, { type: 'error', msg: `Ese jugador no tiene 100 HP.` }); return; } send(target.ws, { type: 'challenged', fromId: id, fromName: challenger.name, fromBeast: challenger.beast, isTraining: false }); }
        if (msg.type === 'challenge_training') { const challenger = lobby.get(id); const target = lobby.get(msg.targetId); if (!challenger || !target || target.inBattle || challenger.inBattle) return; send(target.ws, { type: 'challenged', fromId: id, fromName: challenger.name, fromBeast: challenger.beast, isTraining: true }); }
        if (msg.type === 'accept') { const p1 = lobby.get(msg.fromId), p2 = lobby.get(id); if (!p1 || !p2 || p1.inBattle || p2.inBattle) return; if (msg.isTraining) { p1.inBattle = true; p2.inBattle = true; const bId = `btrain${uid()}`; battles.set(bId, { p1id: msg.fromId, p2id: id, st1: getStartState(p1.beast), st2: getStartState(p2.beast), turnId: msg.fromId, logs: [{t: `¡Entrenamiento 1v1!`, c: 'hi'}], isTraining: true, isCpu: false, p1Wallet: p1.wallet, p2Wallet: p2.wallet, p1Beast: p1.beast, p2Beast: p2.beast }); send(p1.ws, { type: 'battle_start', battleId: bId, role: 'p1', opponent: p2.name, opponentBeast: p2.beast, isTraining: true }); send(p2.ws, { type: 'battle_start', battleId: bId, role: 'p2', opponent: p1.name, opponentBeast: p1.beast, isTraining: true }); await pushLobby(); setTimeout(() => pushBattle(bId), 120); } else { if (p1.isGuest || p2.isGuest) { send(ws, { type: 'error', msg: 'Los invitados no pueden hacer batallas por HP.' }); return; } if (!await hasHP(p1.wallet, 100) || !await hasHP(p2.wallet, 100)) { send(p1.ws, { type: 'error', msg: 'Fondos insuficientes.' }); return; } await lockHP(p1.wallet, 100); await lockHP(p2.wallet, 100); p1.inBattle = true; p2.inBattle = true; const bId = `b${uid()}`; battles.set(bId, { p1id: msg.fromId, p2id: id, st1: getStartState(p1.beast), st2: getStartState(p2.beast), turnId: msg.fromId, logs: [], isCpu: false, isTraining: false, p1Wallet: p1.wallet, p2Wallet: p2.wallet, p1Beast: p1.beast, p2Beast: p2.beast }); battles.get(bId).logs.push({t: `¡Batalla por HP 1v1!`, c: 'hi'}); send(p1.ws, { type: 'battle_start', battleId: bId, role: 'p1', opponent: p2.name, opponentBeast: p2.beast, isCpu: false, isTraining: false }); send(p2.ws, { type: 'battle_start', battleId: bId, role: 'p2', opponent: p1.name, opponentBeast: p1.beast, isCpu: false, isTraining: false }); walletToBattle.set(p1.wallet, bId); walletToBattle.set(p2.wallet, bId); await pushLobby(); setTimeout(() => pushBattle(bId), 120); } }
        if (msg.type === 'challenge_3v3') { const challenger = lobby.get(id); const target = lobby.get(msg.targetId); if (!challenger || !target || target.inBattle || challenger.inBattle) return; if (challenger.isGuest || target.isGuest) { send(ws, { type: 'error', msg: 'Los invitados no pueden hacer batallas por HP.' }); return; } const challengerHP = await getHP(challenger.wallet); const targetHP = await getHP(target.wallet); if (challengerHP < 300) { send(ws, { type: 'error', msg: `Necesitas 300 HP.` }); return; } if (targetHP < 300) { send(ws, { type: 'error', msg: `Ese jugador no tiene 300 HP.` }); return; } challenger.team = msg.team; send(target.ws, { type: 'challenged_3v3', fromId: id, fromName: challenger.name, isTraining: false }); }
        if (msg.type === 'challenge_3v3_training') { const challenger = lobby.get(id); const target = lobby.get(msg.targetId); if (!challenger || !target || target.inBattle || challenger.inBattle) return; challenger.team = msg.team; send(target.ws, { type: 'challenged_3v3', fromId: id, fromName: challenger.name, isTraining: true }); }
        if (msg.type === 'accept_3v3') { const p1 = lobby.get(msg.fromId), p2 = lobby.get(id); if (!p1 || !p2 || p1.inBattle || p2.inBattle) return; p2.team = msg.team; if (!msg.isTraining) { if (p1.isGuest || p2.isGuest) { send(ws, { type: 'error', msg: 'Los invitados no pueden hacer batallas por HP.' }); return; } if (!await hasHP(p1.wallet, 300) || !await hasHP(p2.wallet, 300)) { send(p1.ws, { type: 'error', msg: 'Fondos insuficientes para 3v3.' }); return; } await lockHP(p1.wallet, 300); await lockHP(p2.wallet, 300); } p1.inBattle = true; p2.inBattle = true; const bId = `bteam${uid()}`; battles.set(bId, { p1id: msg.fromId, p2id: id, team1: p1.team.map(k => getStartState(k)), team2: p2.team.map(k => getStartState(k)), active1: 0, active2: 0, turnId: msg.fromId, logs: [{t: `¡Combate 3v3!`, c: 'hi'}], isTeamBattle: true, isTeamTraining: msg.isTraining, isCpu: false, p1Wallet: p1.wallet, p2Wallet: p2.wallet, p1Team: p1.team, p2Team: p2.team }); send(p1.ws, { type: 'battle_start', battleId: bId, role: 'p1', opponent: p2.name, opponentBeast: p2.team[0], isTeamBattle: true, isTraining: msg.isTraining, isCpu: false }); send(p2.ws, { type: 'battle_start', battleId: bId, role: 'p2', opponent: p1.name, opponentBeast: p1.team[0], isTeamBattle: true, isTraining: msg.isTraining, isCpu: false }); if (!msg.isTraining) { walletToBattle.set(p1.wallet, bId); walletToBattle.set(p2.wallet, bId); } await pushLobby(); setTimeout(() => pushTeamBattle(bId), 120); }
        if (msg.type === 'challenge_cpu') { const pl = lobby.get(id); if (!pl || pl.inBattle) return; pl.inBattle = true; const cpuBeast = ZODIAC_KEYS[Math.floor(Math.random() * ZODIAC_KEYS.length)]; const bId = `bcpu${uid()}`; battles.set(bId, { p1id: CPU_ID, p2id: id, st1: getStartState(cpuBeast), st2: getStartState(pl.beast), turnId: CPU_ID, logs: [{t: `¡Entrenamiento 1v1 vs Master!`, c: 'hi'}], isCpu: true, cpuIsP1: true, cpuBeast }); send(ws, { type: 'battle_start', battleId: bId, role: 'p2', opponent: 'Zodiac Master', opponentBeast: cpuBeast, isCpu: true }); await pushLobby(); setTimeout(() => { pushCpuBattle(bId); scheduleCpuTurn(bId); }, 200); }
        
        // NUEVO: Simulación del Laboratorio Vicamon
        if (msg.type === 'lab_simulate') { 
          const pl = lobby.get(id); if (!pl || pl.inBattle) return; 
          pl.inBattle = true; 
          pl.beast = 'custom_lab_beast'; // Beast temporal para que el motor no explote
          
          const cpuBeast = ZODIAC_KEYS[Math.floor(Math.random() * ZODIAC_KEYS.length)]; 
          const bId = `bcpu${uid()}`; 
          battles.set(bId, { 
            p1id: CPU_ID, p2id: id, 
            st1: getStartState(cpuBeast), st2: getStartState(pl.beast), 
            turnId: CPU_ID, 
            logs: [{t: `¡Simulación de Laboratorio!`, c: 'hi'}], 
            isCpu: true, isTraining: true, isLabSimulation: true, // Marcamos que es simulación
            cpuIsP1: true, cpuBeast, 
            customBeast: msg.beast // Guardamos el vicamon creado por el usuario
          }); 
          send(ws, { type: 'battle_start', battleId: bId, role: 'p2', opponent: 'Zodiac Master', opponentBeast: cpuBeast, isCpu: true, isTraining: true, isLabSimulation: true, myBeast: pl.beast }); 
          await pushLobby(); 
          setTimeout(() => { pushCpuBattle(bId); scheduleCpuTurn(bId); }, 200); 
        }

        if (msg.type === 'challenge_3v3_cpu') { const pl = lobby.get(id); if (!pl || pl.inBattle) return; pl.inBattle = true; pl.team = msg.team; const cpuTeam = [ZODIAC_KEYS[Math.floor(Math.random()*ZODIAC_KEYS.length)], ZODIAC_KEYS[Math.floor(Math.random()*ZODIAC_KEYS.length)], ZODIAC_KEYS[Math.floor(Math.random()*ZODIAC_KEYS.length)]]; const bId = `bteamcpu${uid()}`; battles.set(bId, { p1id: CPU_ID, p2id: id, team1: cpuTeam.map(k => getStartState(k)), team2: pl.team.map(k => getStartState(k)), active1: 0, active2: 0, turnId: CPU_ID, logs: [{t: `¡Entrenamiento 3v3 vs Master!`, c: 'hi'}], isTeamBattle: true, isTeamCpu: true, cpuTeam: cpuTeam }); send(ws, { type: 'battle_start', battleId: bId, role: 'p2', opponent: 'Zodiac Master', opponentBeast: cpuTeam[0], isTeamBattle: true, isCpu: true }); await pushLobby(); const { pushTeamCpuBattle, doTeamCpuTurn } = require('./teamEngine'); setTimeout(() => { pushTeamCpuBattle(bId); setTimeout(() => doTeamCpuTurn(bId), 1000); }, 200); }
        if (msg.type === 'attack') { const b = battles.get(msg.battleId); if (!b) return; if (b.isTeamBattle && b.isTeamCpu) await processTeamCpuPlayerTurn(msg.battleId, id, msg.index); else if (b.isTeamBattle) await processTeamTurn(msg.battleId, id, msg.index); else if (b.isGauntlet) await processGauntletPlayerTurn(msg.battleId, id, msg.index); else if (b.isCpu) await processCpuPlayerTurn(msg.battleId, id, msg.index); else await processTurn(msg.battleId, id, msg.index); handleDcAutoSkip(msg.battleId); }
        if (msg.type === 'team_switch') { const b = battles.get(msg.battleId); if (!b) return; await processTeamSwitch(msg.battleId, id, msg.index); }
        if (msg.type === 'surrender') { const b = battles.get(msg.battleId); if (!b) return; if (b.isTeamBattle) { const otherId = b.p1id === id ? b.p2id : b.p1id; const winnerTeam = b.p1id === otherId ? b.team1 : b.team2; const winnerRemainingHp = winnerTeam.reduce((sum, st) => sum + Math.max(0, st.hp), 0); await endTeamBattle(msg.battleId, otherId, id, winnerRemainingHp); } else if (b.isGauntlet) await endGauntlet(msg.battleId, id, false, b.gauntletIndex); else if (b.isCpu) await endBattle(msg.battleId, CPU_ID, id, 0, true); else if (b.p1id === id || b.p2id === id) { const otherId = b.p1id === id ? b.p2id : b.p1id; await endBattle(msg.battleId, otherId, id, 0, true); } }

        if (msg.type === 'challenge_gauntlet') { 
          const pl = lobby.get(id); if (!pl || pl.inBattle) return; 
          if (msg.beast) pl.beast = msg.beast; 
          if (!pl.isGuest) {
            if (!await hasHP(pl.wallet, 100)) { send(ws, { type: 'error', msg: 'Necesitas 100 HP para la Torre.' }); return; } 
            await lockHP(pl.wallet, 100); 
          }
          pl.inBattle = true; 
          const zodiacTeam = [...ZODIAC_KEYS].sort(() => Math.random() - 0.5);
          const cpuBeast = zodiacTeam[0];
          const bId = `bgauntlet${uid()}`; 
          battles.set(bId, { 
            p1id: CPU_ID, p2id: id, 
            st1: getStartState(cpuBeast), st2: getStartState(pl.beast), 
            turnId: CPU_ID, 
            logs: [{t: `¡Torre de Batalla!`, c: 'hi'}], 
            isCpu: true, isGauntlet: true, gauntletIndex: 0, 
            cpuIsP1: true, cpuBeast, 
            gauntletTeam: zodiacTeam 
          }); 
          send(ws, { type: 'battle_start', battleId: bId, role: 'p2', opponent: 'Zodiac Master', opponentBeast: cpuBeast, isCpu: true, isGauntlet: true }); 
          await pushLobby(); 
          setTimeout(() => { pushCpuBattle(bId); scheduleGauntletCpuTurn(bId); }, 200); 
        }
        
        if (msg.type === 'gauntlet_continue') { const b = battles.get(msg.battleId); if (!b || !b.isGauntlet) return; const pl = lobby.get(id); if (msg.beast) pl.beast = msg.beast; b.st2 = getStartState(pl.beast); b.st1 = getStartState(b.cpuBeast); b.turnId = CPU_ID; pushCpuBattle(msg.battleId); scheduleGauntletCpuTurn(msg.battleId); }
        
        // NUEVO: Recepción de la solicitud de creación de Vicamon
        if (msg.type === 'submit_custom_vicamon') {
           const pl = lobby.get(id); if (!pl || pl.isGuest) return;
           // Aquí iría la lógica para descontar HP y guardar en DB.
           // Por ahora solo respondemos para evitar que se quede colgado
           send(ws, { type: 'error', msg: '¡Solicitud recibida! (Función de admin en desarrollo).' });
        }

        if (msg.type === 'cashout') { const pl = lobby.get(id); if (!pl || pl.inBattle || pl.isGuest) { send(ws, { type: 'cashout_result', ok: false, reason: 'No permitido para invitados' }); return; } const currentHp = await getHP(pl.wallet); if (currentHp <= 0) { send(ws, { type: 'cashout_result', ok: false, reason: 'Sin HP' }); return; } const usdcNeeded = parseFloat((currentHp * 0.001).toFixed(6)); getPlatformUSDCBalance().then(async balance => { if (balance < usdcNeeded) { send(ws, { type: 'cashout_result', ok: false, reason: `Fondos insuficientes en la plataforma.` }); return; } const result = await cashout(pl.wallet); if (!result.ok) { send(ws, { type: 'cashout_result', ok: false, reason: 'Error' }); return; } send(ws, { type: 'cashout_result', ok: true, hp: result.hp, usdc: result.usdc, status: 'processing' }); sendUSDC(pl.wallet, result.usdc).then(sig => send(ws, { type: 'cashout_result', ok: true, hp: result.hp, usdc: result.usdc, status: 'confirmed', tx: sig })).catch(async e => { await addHP(pl.wallet, result.hp); send(ws, { type: 'cashout_result', ok: false, reason: e.message }); }); }).catch(e => send(ws, { type: 'cashout_result', ok: false, reason: 'Error de balance' })); }
        if (msg.type === 'chat_message') { const p = lobby.get(id); if (!p) return; broadcast({ type: 'chat_message', name: p.name, text: (msg.text || '').slice(0, 200) }); }
        if (msg.type === 'ping') { const p = lobby.get(id); if (p) { send(ws, { type: 'hp_updated', hp: p.isGuest ? 0 : await getHP(p.wallet || '') }); await pushLobby(); } }
        if (msg.type === 'leave_lobby') { const p = lobby.get(id); if (p && !p.inBattle) { lobby.delete(id); await pushLobby(); } }
      } catch(e) { console.error("Error procesando mensaje:", e); send(ws, { type: 'error', msg: 'Ocurrió un error interno en el servidor.' }); }
    });

    ws.on('close', async () => {
      try {
        const p = lobby.get(id); if (!p) return;
        if (p.wallet) { for (const [code, wallet] of activePhysicalCodes) { if (wallet === p.wallet) activePhysicalCodes.delete(code); } }
        const bId = walletToBattle.get(p.wallet); const b = battles.get(bId);
        if (p.isGuest && b && !b.isTraining && !b.isCpu && !b.isGauntlet) { const winnerId = (id === b.p1id) ? b.p2id : b.p1id; const winnerSt = (id === b.p1id) ? b.st2 : b.st1; await endBattle(bId, winnerId, id, Math.max(0, winnerSt.hp)); walletToBattle.delete(p.wallet); } 
        else if (b && !b.isTraining && !b.isCpu && !b.isGauntlet) { b.dcPlayerId = id; b.dcWallet = p.wallet; b.dcTime = Date.now(); b.dcTimer = setTimeout(async () => { const currentB = battles.get(bId); if (currentB && currentB.dcPlayerId === id) { const winnerId = (id === currentB.p1id) ? currentB.p2id : currentB.p1id; if (currentB.isTeamBattle) { const winnerTeam = (id === currentB.p1id) ? currentB.team2 : currentB.team1; const hp = winnerTeam.reduce((sum, st) => sum + Math.max(0, st.hp), 0); await endTeamBattle(bId, winnerId, id, hp); } else { const winnerSt = (id === currentB.p1id) ? currentB.st2 : currentB.st1; await endBattle(bId, winnerId, id, Math.max(0, winnerSt.hp)); } walletToBattle.delete(p.wallet); } }, 60000); if (b.turnId === id) { b.dcTurnTimer = setTimeout(async () => { const currentB = battles.get(bId); if (currentB && currentB.dcPlayerId === id && currentB.turnId === id) { if (currentB.isTeamBattle) await processTeamTurn(bId, id, -1); else await processTurn(bId, id, -1); } }, 15000); } const oppId = (id === b.p1id) ? b.p2id : b.p1id; const opp = lobby.get(oppId); if (opp) send(opp.ws, { type: 'opponent_disconnected', secondsLeft: 60 }); lobby.delete(id); await pushLobby(); return; }
        for (const [bId, b] of battles) { if (b.isTraining && (b.p1id === id || b.p2id === id)) { battles.delete(bId); } else if (b.isTeamBattle && (b.p1id === id || b.p2id === id)) { const otherId = b.p1id === id ? b.p2id : b.p1id; const winnerTeam = b.p1id === otherId ? b.team1 : b.team2; const winnerRemainingHp = winnerTeam.reduce((sum, st) => sum + Math.max(0, st.hp), 0); await endTeamBattle(bId, otherId, id, winnerRemainingHp); } else if (b.isGauntlet && b.p2id === id) { await endGauntlet(bId, id, false, b.gauntletIndex); } else if (b.isCpu && b.p2id === id) { battles.delete(bId); } else if (b.p1id === id || b.p2id === id) { const otherId = b.p1id === id ? b.p2id : b.p1id; await endBattle(bId, otherId, id, 0, true); } }
        lobby.delete(id); await pushLobby();
      } catch(e) { console.error("Error en cierre de WebSocket:", e); }
    });
  });
}

module.exports = { setupWebSocketServer };
