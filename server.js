const http = require('http');
const fs   = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const {
  getHP, addHP, hasHP, lockHP, unlockHP, settleMatch, cashout,
  getPlatformHp, getPlatformUsdc, clearPlatformHp,
  PLATFORM_WALLET, PLATFORM_THRESHOLD, USDC_PER_HP,
  getAllPlayersDebug, updatePlayerName, updatePlayerStats, getTopPlayers,
  getPlayerStats, getPlayerRank, settleGauntlet,
  isTxProcessed, markTxProcessed, adminSetHP, adminResetPlatform, adminUnlockAllHP
} = require('./hp-balance');
const { sendUSDC } = require('./transfer');
const BEASTS = require('./beasts.js');
const BEAST_KEYS = Object.keys(BEASTS);

const { lobby, battles, walletToBattle, uid, send, broadcast, pushLobby, pushBattle, pushCpuBattle } = require('./state');
const { getStartState, processTurn, endBattle } = require('./battleEngine');
const { CPU_ID, processCpuPlayerTurn, scheduleCpuTurn } = require('./cpuLogic');
const { processGauntletPlayerTurn, endGauntlet, scheduleGauntletCpuTurn } = require('./gauntletManager');
const { pushTeamBattle, processTeamTurn, processTeamSwitch, processTeamCpuPlayerTurn, endTeamBattle } = require('./teamEngine');

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

async function getPlatformUSDCBalance() {
  const { Connection, PublicKey } = require('@solana/web3.js');
  const { getAssociatedTokenAddress } = require('@solana/spl-token');
  const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  const RPCS = ['https://api.mainnet-beta.solana.com', 'https://solana-mainnet.rpc.extrnode.com', 'https://solana.public-rpc.com'];
  for (const rpc of RPCS) { 
    try { 
      const conn = new Connection(rpc, 'confirmed'); 
      const platformPk = new PublicKey(PLATFORM_WALLET);
      const platformTA = await getAssociatedTokenAddress(USDC_MINT, platformPk);
      const info = await conn.getTokenAccountBalance(platformTA); 
      return parseFloat(info.value.uiAmount || 0); 
    } catch(e) {} 
  }
  return 0;
}

const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.gif':'image/gif', '.svg':'image/svg+xml', '.ico':'image/x-icon' };

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];
  
  if (urlPath === '/ver-db-secreta') { try { const players = await getAllPlayersDebug(); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(players, null, 2)); } catch(e) { res.writeHead(500); res.end('Error leyendo DB'); } return; }
  
  if (urlPath === '/platform-wallet') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ wallet: PLATFORM_WALLET }));
    return;
  }

  if (urlPath === '/admin') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html lang="es"><head><meta charset="UTF-8"><title>Admin - VICAMON</title>
      <style>
        body { font-family: system-ui; background: #0a0a0f; color: #fff; padding: 20px; max-width: 1000px; margin: 0 auto; }
        .header { display: flex; gap: 10px; margin-bottom: 20px; align-items: center; }
        input, button { background: #1a1a24; border: 1px solid #333; color: #fff; padding: 10px; border-radius: 8px; outline: none; }
        button { cursor: pointer; background: #4a9eff; border: none; font-weight: bold; }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        .plat-info { background: #14141e; padding: 15px; border-radius: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
        .plat-info span { font-size: 14px; color: #85B7EB; }
        .plat-info b { font-size: 18px; color: #5DCAA5; }
        table { width: 100%; border-collapse: collapse; background: #14141e; border-radius: 12px; overflow: hidden; }
        th, td { padding: 12px; border-bottom: 1px solid #2a2a35; text-align: left; font-size: 14px; }
        th { color: #85B7EB; text-transform: uppercase; font-size: 12px; }
        td input { width: 80px; padding: 5px; background: #111; border: 1px solid #333; text-align: center; color: #fff; border-radius: 4px; }
        .btn-save { background: #5DCAA5; padding: 8px 16px; color: #000; }
        .admin-actions { margin-top: 20px; display: flex; gap: 10px; flex-wrap: wrap; }
        .btn-withdraw { background: #F5A623; color: #000; padding: 10px 20px; font-size: 14px; }
      </style></head><body>
        <h1>Panel de Administración</h1>
        <div class="header">
          <input type="password" id="pass" placeholder="Contraseña de admin">
          <button onclick="loadData()">Desbloquear y Cargar</button>
        </div>
        <div class="plat-info" id="plat-info" style="display:none">
          <span>HP Ganados por la Plataforma (Comisiones):</span>
          <b id="plat-hp">-</b>
        </div>
        <div class="admin-actions" id="admin-btns" style="display:none">
          <button onclick="withdrawFunds()" id="btn-withdraw" class="btn-withdraw">💸 Retirar Ganancias a Wallet</button>
          <button onclick="resetPlatformHP()">Resetear HP Plataforma</button>
          <button onclick="unlockAllHP()">Desbloquear HP de todos</button>
        </div>
        <br><br>
        <table id="tbl" style="display:none">
          <thead><tr><th>Wallet</th><th>Nickname</th><th>HP</th><th>HP Bloqueados</th><th>Acción</th></tr></thead>
          <tbody id="data"></tbody>
        </table>
        <script>
          let globalPass = '';
          async function loadData() {
            globalPass = document.getElementById('pass').value;
            if(!globalPass) return alert('Ingresa la contraseña');
            const res = await fetch('/admin-data?pass=' + encodeURIComponent(globalPass));
            if(!res.ok) { alert('Contraseña incorrecta'); return; }
            const data = await res.json();
            document.getElementById('plat-info').style.display = 'flex';
            document.getElementById('tbl').style.display = 'table';
            document.getElementById('admin-btns').style.display = 'flex';
            document.getElementById('plat-hp').textContent = data.platformHp + ' HP (' + (data.platformHp * 0.001).toFixed(3) + ' USDC)';
            document.getElementById('data').innerHTML = data.players.map(p => \`<tr><td>\${p.wallet.slice(0,8)}...\${p.wallet.slice(-4)}</td><td>\${p.last_name || '-'}</td><td><input type="number" value="\${p.hp}" id="hp-\${p.wallet}"></td><td>\${p.locked_hp || 0}</td><td><button class="btn-save" onclick="saveHP('\${p.wallet}')">Guardar</button></td></tr>\`).join('');
          }
          async function saveHP(wallet) { const hp = document.getElementById('hp-' + wallet).value; const res = await fetch('/admin-update-hp', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ pass: globalPass, wallet, hp: parseInt(hp) }) }); const data = await res.json(); if(data.ok) alert('✓ HP actualizado a ' + hp); else alert('Error al actualizar'); }
          async function resetPlatformHP() { if(!confirm('¿Resetear los HP de la plataforma a 0?')) return; const res = await fetch('/admin-reset-platform', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ pass: globalPass }) }); if(res.ok) alert('✓ HP de la plataforma reseteados.'); }
          async function unlockAllHP() { if(!confirm('¿Desbloquear todos los HP de jugadores?')) return; const res = await fetch('/admin-unlock-hp', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ pass: globalPass }) }); if(res.ok) alert('✓ HP desbloqueados.'); }
          
          async function withdrawFunds() {
            const btn = document.getElementById('btn-withdraw');
            if(!confirm('¿Retirar TODOS los USDC de la plataforma a tu wallet personal?')) return;
            btn.disabled = true; btn.textContent = 'Procesando retiro...';
            try {
              const res = await fetch('/admin-withdraw', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ pass: globalPass }) });
              const data = await res.json();
              if(data.ok) { alert('✓ Retiro exitoso! Se enviaron ' + data.amount + ' USDC. TX: ' + data.sig); location.reload(); }
              else { alert('Error al retirar: ' + (data.msg || 'Desconocido')); }
            } catch(e) { alert('Error de conexión'); }
            btn.disabled = false; btn.textContent = '💸 Retirar Ganancias a Wallet';
          }
        </script>
      </body></html>
    `);
    return;
  }

  if (urlPath === '/admin-data') { const pass = new URL(req.url, 'http://localhost').searchParams.get('pass') || ''; if (pass !== ADMIN_PASS) { res.writeHead(403); res.end('Forbidden'); return; } try { const players = await getAllPlayersDebug(); const platformHp = await getPlatformHp(); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ players, platformHp })); } catch(e) { res.writeHead(500); res.end('Error'); } return; }
  if (urlPath === '/admin-update-hp' && req.method === 'POST') { let body = ''; req.on('data', c => body += c); req.on('end', async () => { try { const { pass, wallet, hp } = JSON.parse(body); if (pass !== ADMIN_PASS) { res.writeHead(403); res.end(JSON.stringify({ ok: false })); return; } await adminSetHP(wallet, parseInt(hp)); res.writeHead(200); res.end(JSON.stringify({ ok: true })); } catch(e) { res.writeHead(400); res.end(JSON.stringify({ ok: false })); } }); return; }
  if (urlPath === '/admin-reset-platform' && req.method === 'POST') { let body = ''; req.on('data', c => body += c); req.on('end', async () => { try { const { pass } = JSON.parse(body); if (pass !== ADMIN_PASS) { res.writeHead(403); res.end(JSON.stringify({ ok: false })); return; } await adminResetPlatform(); res.writeHead(200); res.end(JSON.stringify({ ok: true })); } catch(e) { res.writeHead(400); res.end(JSON.stringify({ ok: false })); } }); return; }
  if (urlPath === '/admin-unlock-hp' && req.method === 'POST') { let body = ''; req.on('data', c => body += c); req.on('end', async () => { try { const { pass } = JSON.parse(body); if (pass !== ADMIN_PASS) { res.writeHead(403); res.end(JSON.stringify({ ok: false })); return; } await adminUnlockAllHP(); res.writeHead(200); res.end(JSON.stringify({ ok: true })); } catch(e) { res.writeHead(400); res.end(JSON.stringify({ ok: false })); } }); return; }
  
  if (urlPath === '/admin-withdraw' && req.method === 'POST') {
    let body = ''; req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { pass } = JSON.parse(body);
        if (pass !== ADMIN_PASS) { res.writeHead(403); res.end(JSON.stringify({ ok: false, msg: 'Forbidden' })); return; }
        if (!OWNER_WALLET) { res.writeHead(400); res.end(JSON.stringify({ ok: false, msg: 'OWNER_WALLET no configurada en el servidor' })); return; }
        const balance = await getPlatformUSDCBalance();
        if (balance <= 0.001) { res.writeHead(400); res.end(JSON.stringify({ ok: false, msg: 'No hay suficientes USDC para retirar' })); return; }
        const sig = await sendUSDC(OWNER_WALLET, balance);
        const hpToClear = Math.round(balance / USDC_PER_HP);
        await clearPlatformHp(hpToClear);
        res.writeHead(200); res.end(JSON.stringify({ ok: true, amount: balance, sig }));
      } catch(e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, msg: e.message })); }
    });
    return;
  }

  if (urlPath === '/hp') { 
    const wallet = new URL(req.url, 'http://localhost').searchParams.get('wallet') || ''; 
    if (wallet.startsWith('guest_')) {
      res.writeHead(200, { 'Content-Type': 'application/json' }); 
      res.end(JSON.stringify({ hp: 0, wallet, stats: { wins: 0, losses: 0, rank: null } })); 
      return;
    }
    const hp = await getHP(wallet); const stats = await getPlayerStats(wallet); const rank = await getPlayerRank(wallet); 
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ hp, wallet, stats: { wins: stats.wins, losses: stats.losses, rank } })); return; 
  }
  
  if (urlPath === '/payment' && req.method === 'POST') {
    const secret = req.headers['x-internal-secret'];
    if (secret !== (process.env.INTERNAL_SECRET || 'dev-secret')) { res.writeHead(403); res.end(JSON.stringify({ error: 'Forbidden' })); return; }
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { wallet, amount, signature, memo } = JSON.parse(body);
        if (await isTxProcessed(signature)) { res.writeHead(200); res.end(JSON.stringify({ ok: false, reason: 'duplicate' })); return; }
        const hp = Math.round((amount / 100_000) * 100);
        const newBalance = await addHP(wallet, hp);
        lobby.forEach(p => { if (p.wallet === wallet) send(p.ws, { type: 'hp_updated', hp: newBalance }); });
        await markTxProcessed(signature);
        res.writeHead(200); res.end(JSON.stringify({ ok: true, wallet, hp, newBalance }));
        checkPlatformTransfer();
      } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }
  
  const file = urlPath === '/' ? '/index.html' : urlPath;
  const fp = path.join(__dirname, file);
  fs.readFile(fp, (err, data) => { if (err) { res.writeHead(404); res.end('Not found'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' }); res.end(data); });
});

async function checkPlatformTransfer() {
  const usdc = await getPlatformUsdc();
  if (usdc < PLATFORM_THRESHOLD) return;
  try { const sig = await sendUSDC(PLATFORM_WALLET, usdc); const hpCleared = Math.round(usdc / USDC_PER_HP); await clearPlatformHp(hpCleared); } catch (e) {}
}

const wss = new WebSocketServer({ server });

wss.on('connection', ws => {
  const id = uid();

  ws.on('message', async raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    try {
      if (msg.type === 'join') {
        const wallet = msg.wallet || '';
        const isGuest = msg.isGuest || wallet.startsWith('guest_'); 
        
        if (!isGuest && walletToBattle.has(wallet)) {
          const bId = walletToBattle.get(wallet);
          const b = battles.get(bId);
          if (b) {
            clearTimeout(b.dcTimer); clearTimeout(b.dcTurnTimer);
            b.dcPlayerId = null; b.dcWallet = null;
            for (const [oldId, p] of lobby) {
              if (p.wallet === wallet && oldId !== id) { lobby.delete(oldId); try { p.ws.close(); } catch(e) {} }
            }
            const isP1 = b.p1Wallet === wallet; const oldId = isP1 ? b.p1id : b.p2id;
            if (isP1) b.p1id = id; else b.p2id = id;
            if (b.turnId === oldId) b.turnId = id;
            lobby.set(id, { ws, name: msg.name, beast: isP1 ? b.p1Beast : b.p2Beast, wallet, inBattle: true, id, isGuest: false });
            const oppId = isP1 ? b.p2id : b.p1id; const opp = lobby.get(oppId);
            if (opp) send(opp.ws, { type: 'opponent_reconnected' });
            if (b.isTeamBattle) {
              send(ws, { type: 'reconnect_battle', battleId: bId, role: isP1 ? 'p1' : 'p2', id: id, isTeamBattle: true, opponent: opp?.name || 'Rival', yourTurn: b.turnId === id, myBeast: isP1 ? b.p1Beast : b.p2Beast, oppBeast: isP1 ? b.p2Beast : b.p1Beast });
              setTimeout(() => pushTeamBattle(bId), 200);
            } else {
              send(ws, { type: 'reconnect_battle', battleId: bId, role: isP1 ? 'p1' : 'p2', id: id, isTeamBattle: false, opponent: opp?.name || 'Rival', yourTurn: b.turnId === id, myBeast: isP1 ? b.p1Beast : b.p2Beast, oppBeast: isP1 ? b.p2Beast : b.p1Beast });
              setTimeout(() => pushBattle(bId), 200);
            }
            await pushLobby(); return;
          } else { walletToBattle.delete(wallet); }
        }

        for (const [oldId, p] of lobby) {
          if (p.wallet === wallet && oldId !== id) {
            send(p.ws, { type: 'kicked', msg: 'Tu wallet se conectó en otra pestaña.' });
            if (!p.inBattle) lobby.delete(oldId);
            try { p.ws.close(); } catch(e) {}
          }
        }
        lobby.set(id, { ws, name: msg.name, beast: msg.beast, wallet, inBattle: false, id, isGuest });
        
        if (isGuest) {
          send(ws, { type: 'joined', id, hp: 0, isGuest: true, stats: { wins: 0, losses: 0, rank: null } });
        } else {
          await updatePlayerName(wallet, msg.name);
          const hp = await getHP(wallet);
          const stats = await getPlayerStats(wallet);
          const rank = await getPlayerRank(wallet);
          send(ws, { type: 'joined', id, hp, isGuest: false, stats: { wins: stats.wins, losses: stats.losses, rank } });
          const top = await getTopPlayers(3);
          send(ws, { type: 'leaderboard_update', top });
        }
        await pushLobby();
      }

      if (msg.type === 'change_beast') { const p = lobby.get(id); if (p && !p.inBattle) { p.beast = msg.beast; await pushLobby(); } }
      if (msg.type === 'update_nickname') { 
        const p = lobby.get(id); 
        if (p) { 
          p.name = msg.name; 
          if (!p.isGuest) await updatePlayerName(p.wallet, msg.name);
          await pushLobby(); send(ws, { type: 'nickname_updated', name: msg.name }); 
        } 
      }

      if (msg.type === 'challenge') {
        const challenger = lobby.get(id); const target = lobby.get(msg.targetId);
        if (!challenger || !target || target.inBattle || challenger.inBattle) return;
        if (challenger.isGuest || target.isGuest) { send(ws, { type: 'error', msg: 'Los invitados solo pueden entrenar.' }); return; }
        const challengerHP = await getHP(challenger.wallet); const targetHP = await getHP(target.wallet);
        if (challengerHP < 100) { send(ws, { type: 'error', msg: `Necesitas 100 HP.` }); return; }
        if (targetHP < 100) { send(ws, { type: 'error', msg: `Ese jugador no tiene 100 HP.` }); return; }
        send(target.ws, { type: 'challenged', fromId: id, fromName: challenger.name, fromBeast: challenger.beast, isTraining: false });
      }
      if (msg.type === 'challenge_training') {
        const challenger = lobby.get(id); const target = lobby.get(msg.targetId);
        if (!challenger || !target || target.inBattle || challenger.inBattle) return;
        send(target.ws, { type: 'challenged', fromId: id, fromName: challenger.name, fromBeast: challenger.beast, isTraining: true });
      }
      
      if (msg.type === 'accept') {
        const p1 = lobby.get(msg.fromId), p2 = lobby.get(id);
        if (!p1 || !p2 || p1.inBattle || p2.inBattle) return;
        if (msg.isTraining) {
          p1.inBattle = true; p2.inBattle = true;
          const bId = `btrain${uid()}`;
          battles.set(bId, { p1id: msg.fromId, p2id: id, st1: getStartState(p1.beast), st2: getStartState(p2.beast), turnId: msg.fromId, logs: [{t: `¡Entrenamiento 1v1!`, c: 'hi'}], isTraining: true, isCpu: false, p1Wallet: p1.wallet, p2Wallet: p2.wallet, p1Beast: p1.beast, p2Beast: p2.beast });
          send(p1.ws, { type: 'battle_start', battleId: bId, role: 'p1', opponent: p2.name, opponentBeast: p2.beast, isTraining: true });
          send(p2.ws, { type: 'battle_start', battleId: bId, role: 'p2', opponent: p1.name, opponentBeast: p1.beast, isTraining: true });
          await pushLobby(); setTimeout(() => pushBattle(bId), 120);
        } else {
          if (p1.isGuest || p2.isGuest) { send(ws, { type: 'error', msg: 'Los invitados no pueden hacer batallas por HP.' }); return; }
          if (!await hasHP(p1.wallet, 100) || !await hasHP(p2.wallet, 100)) { send(p1.ws, { type: 'error', msg: 'Fondos insuficientes.' }); return; }
          await lockHP(p1.wallet, 100); await lockHP(p2.wallet, 100);
          p1.inBattle = true; p2.inBattle = true;
          const bId = `b${uid()}`;
          battles.set(bId, { p1id: msg.fromId, p2id: id, st1: getStartState(p1.beast), st2: getStartState(p2.beast), turnId: msg.fromId, logs: [], isCpu: false, isTraining: false, p1Wallet: p1.wallet, p2Wallet: p2.wallet, p1Beast: p1.beast, p2Beast: p2.beast });
          battles.get(bId).logs.push({t: `¡Batalla por HP 1v1!`, c: 'hi'});
          send(p1.ws, { type: 'battle_start', battleId: bId, role: 'p1', opponent: p2.name, opponentBeast: p2.beast, isCpu: false, isTraining: false });
          send(p2.ws, { type: 'battle_start', battleId: bId, role: 'p2', opponent: p1.name, opponentBeast: p1.beast, isCpu: false, isTraining: false });
          walletToBattle.set(p1.wallet, bId); walletToBattle.set(p2.wallet, bId);
          await pushLobby(); setTimeout(() => pushBattle(bId), 120);
        }
      }

      if (msg.type === 'challenge_3v3') {
        const challenger = lobby.get(id); const target = lobby.get(msg.targetId);
        if (!challenger || !target || target.inBattle || challenger.inBattle) return;
        if (challenger.isGuest || target.isGuest) { send(ws, { type: 'error', msg: 'Los invitados no pueden hacer batallas por HP.' }); return; }
        const challengerHP = await getHP(challenger.wallet); const targetHP = await getHP(target.wallet);
        if (challengerHP < 300) { send(ws, { type: 'error', msg: `Necesitas 300 HP.` }); return; }
        if (targetHP < 300) { send(ws, { type: 'error', msg: `Ese jugador no tiene 300 HP.` }); return; }
        challenger.team = msg.team;
        send(target.ws, { type: 'challenged_3v3', fromId: id, fromName: challenger.name, isTraining: false });
      }
      if (msg.type === 'challenge_3v3_training') {
        const challenger = lobby.get(id); const target = lobby.get(msg.targetId);
        if (!challenger || !target || target.inBattle || challenger.inBattle) return;
        challenger.team = msg.team;
        send(target.ws, { type: 'challenged_3v3', fromId: id, fromName: challenger.name, isTraining: true });
      }
      if (msg.type === 'accept_3v3') {
        const p1 = lobby.get(msg.fromId), p2 = lobby.get(id);
        if (!p1 || !p2 || p1.inBattle || p2.inBattle) return;
        p2.team = msg.team;
        if (!msg.isTraining) {
          if (p1.isGuest || p2.isGuest) { send(ws, { type: 'error', msg: 'Los invitados no pueden hacer batallas por HP.' }); return; }
          if (!await hasHP(p1.wallet, 300) || !await hasHP(p2.wallet, 300)) { send(p1.ws, { type: 'error', msg: 'Fondos insuficientes para 3v3.' }); return; }
          await lockHP(p1.wallet, 300); await lockHP(p2.wallet, 300);
        }
        p1.inBattle = true; p2.inBattle = true;
        const bId = `bteam${uid()}`;
        battles.set(bId, { p1id: msg.fromId, p2id: id, team1: p1.team.map(k => getStartState(k)), team2: p2.team.map(k => getStartState(k)), active1: 0, active2: 0, turnId: msg.fromId, logs: [{t: `¡Combate 3v3!`, c: 'hi'}], isTeamBattle: true, isTeamTraining: msg.isTraining, isCpu: false, p1Wallet: p1.wallet, p2Wallet: p2.wallet, p1Team: p1.team, p2Team: p2.team });
        send(p1.ws, { type: 'battle_start', battleId: bId, role: 'p1', opponent: p2.name, opponentBeast: p2.team[0], isTeamBattle: true, isTraining: msg.isTraining, isCpu: false });
        send(p2.ws, { type: 'battle_start', battleId: bId, role: 'p2', opponent: p1.name, opponentBeast: p1.team[0], isTeamBattle: true, isTraining: msg.isTraining, isCpu: false });
        if (!msg.isTraining) { walletToBattle.set(p1.wallet, bId); walletToBattle.set(p2.wallet, bId); }
        await pushLobby(); setTimeout(() => pushTeamBattle(bId), 120);
      }

      if (msg.type === 'challenge_cpu') {
        const pl = lobby.get(id); if (!pl || pl.inBattle) return; pl.inBattle = true;
        const cpuBeast = BEAST_KEYS[Math.floor(Math.random() * BEAST_KEYS.length)];
        const bId = `bcpu${uid()}`;
        battles.set(bId, { p1id: CPU_ID, p2id: id, st1: getStartState(cpuBeast), st2: getStartState(pl.beast), turnId: CPU_ID, logs: [{t: `¡Entrenamiento 1v1 vs Master!`, c: 'hi'}], isCpu: true, cpuIsP1: true, cpuBeast });
        send(ws, { type: 'battle_start', battleId: bId, role: 'p2', opponent: 'Zodiac Master', opponentBeast: cpuBeast, isCpu: true });
        await pushLobby(); setTimeout(() => { pushCpuBattle(bId); scheduleCpuTurn(bId); }, 200);
      }
      
      if (msg.type === 'challenge_3v3_cpu') {
        const pl = lobby.get(id); if (!pl || pl.inBattle) return; pl.inBattle = true; pl.team = msg.team;
        const cpuTeam = [BEAST_KEYS[Math.floor(Math.random()*12)], BEAST_KEYS[Math.floor(Math.random()*12)], BEAST_KEYS[Math.floor(Math.random()*12)]];
        const bId = `bteamcpu${uid()}`;
        battles.set(bId, { p1id: CPU_ID, p2id: id, team1: cpuTeam.map(k => getStartState(k)), team2: pl.team.map(k => getStartState(k)), active1: 0, active2: 0, turnId: CPU_ID, logs: [{t: `¡Entrenamiento 3v3 vs Master!`, c: 'hi'}], isTeamBattle: true, isTeamCpu: true, cpuTeam: cpuTeam });
        send(ws, { type: 'battle_start', battleId: bId, role: 'p2', opponent: 'Zodiac Master', opponentBeast: cpuTeam[0], isTeamBattle: true, isCpu: true });
        await pushLobby(); 
        const { pushTeamCpuBattle, doTeamCpuTurn } = require('./teamEngine');
        setTimeout(() => { pushTeamCpuBattle(bId); setTimeout(() => doTeamCpuTurn(bId), 1000); }, 200);
      }

      if (msg.type === 'attack') {
        const b = battles.get(msg.battleId); if (!b) return;
        if (b.isTeamBattle && b.isTeamCpu) await processTeamCpuPlayerTurn(msg.battleId, id, msg.index);
        else if (b.isTeamBattle) await processTeamTurn(msg.battleId, id, msg.index);
        else if (b.isGauntlet) await processGauntletPlayerTurn(msg.battleId, id, msg.index);
        else if (b.isCpu) await processCpuPlayerTurn(msg.battleId, id, msg.index);
        else await processTurn(msg.battleId, id, msg.index);
        handleDcAutoSkip(msg.battleId);
      }
      
      if (msg.type === 'team_switch') { const b = battles.get(msg.battleId); if (!b) return; await processTeamSwitch(msg.battleId, id, msg.index); }
      
      if (msg.type === 'surrender') {
        const b = battles.get(msg.battleId); if (!b) return;
        if (b.isTeamBattle) { const otherId = b.p1id === id ? b.p2id : b.p1id; const winnerTeam = b.p1id === otherId ? b.team1 : b.team2; const winnerRemainingHp = winnerTeam.reduce((sum, st) => sum + Math.max(0, st.hp), 0); await endTeamBattle(msg.battleId, otherId, id, winnerRemainingHp); }
        else if (b.isGauntlet) await endGauntlet(msg.battleId, id, false);
        else if (b.isCpu) await endBattle(msg.battleId, CPU_ID, id, 0, true);
        else if (b.p1id === id || b.p2id === id) { const otherId = b.p1id === id ? b.p2id : b.p1id; await endBattle(msg.battleId, otherId, id, 0, true); }
      }

      if (msg.type === 'challenge_gauntlet') {
        const pl = lobby.get(id); if (!pl || pl.inBattle) return;
        if (pl.isGuest) { send(ws, { type: 'error', msg: 'Los invitados no pueden entrar a la Torre.' }); return; }
        if (msg.beast) pl.beast = msg.beast; 
        if (!await hasHP(pl.wallet, 100)) { send(ws, { type: 'error', msg: 'Necesitas 100 HP para la Torre.' }); return; }
        await lockHP(pl.wallet, 100); pl.inBattle = true;
        const cpuBeast = BEAST_KEYS[0];
        const bId = `bgauntlet${uid()}`;
        battles.set(bId, { p1id: CPU_ID, p2id: id, st1: getStartState(cpuBeast), st2: getStartState(pl.beast), turnId: CPU_ID, logs: [{t: `¡Torre de Batalla!`, c: 'hi'}], isCpu: true, isGauntlet: true, gauntletIndex: 0, cpuIsP1: true, cpuBeast });
        send(ws, { type: 'battle_start', battleId: bId, role: 'p2', opponent: 'Zodiac Master', opponentBeast: cpuBeast, isCpu: true, isGauntlet: true });
        await pushLobby(); setTimeout(() => { pushCpuBattle(bId); scheduleGauntletCpuTurn(bId); }, 200);
      }
      if (msg.type === 'gauntlet_continue') {
        const b = battles.get(msg.battleId); if (!b || !b.isGauntlet) return; const pl = lobby.get(id);
        if (msg.beast) pl.beast = msg.beast;
        b.st2 = getStartState(pl.beast); b.st1 = getStartState(b.cpuBeast); b.turnId = CPU_ID;
        pushCpuBattle(msg.battleId); scheduleGauntletCpuTurn(msg.battleId);
      }
      
      if (msg.type === 'cashout') {
        const pl = lobby.get(id);
        if (!pl || pl.inBattle || pl.isGuest) { send(ws, { type: 'cashout_result', ok: false, reason: 'No permitido para invitados' }); return; }
        const currentHp = await getHP(pl.wallet);
        if (currentHp <= 0) { send(ws, { type: 'cashout_result', ok: false, reason: 'Sin HP' }); return; }
        const usdcNeeded = parseFloat((currentHp * 0.001).toFixed(6));
        getPlatformUSDCBalance().then(async balance => {
          if (balance < usdcNeeded) { send(ws, { type: 'cashout_result', ok: false, reason: `Fondos insuficientes en la plataforma.` }); return; }
          const result = await cashout(pl.wallet);
          if (!result.ok) { send(ws, { type: 'cashout_result', ok: false, reason: 'Error' }); return; }
          send(ws, { type: 'cashout_result', ok: true, hp: result.hp, usdc: result.usdc, status: 'processing' });
          sendUSDC(pl.wallet, result.usdc).then(sig => send(ws, { type: 'cashout_result', ok: true, hp: result.hp, usdc: result.usdc, status: 'confirmed', tx: sig })).catch(async e => { await addHP(pl.wallet, result.hp); send(ws, { type: 'cashout_result', ok: false, reason: e.message }); });
        }).catch(e => send(ws, { type: 'cashout_result', ok: false, reason: 'Error de balance' }));
      }
      
      if (msg.type === 'chat_message') { const p = lobby.get(id); if (!p) return; broadcast({ type: 'chat_message', name: p.name, text: (msg.text || '').slice(0, 200) }); }
      if (msg.type === 'ping') { const p = lobby.get(id); if (p) { send(ws, { type: 'hp_updated', hp: p.isGuest ? 0 : await getHP(p.wallet || '') }); await pushLobby(); } }
      if (msg.type === 'leave_lobby') { const p = lobby.get(id); if (p && !p.inBattle) { lobby.delete(id); await pushLobby(); } }
    } catch(e) {
      console.error("Error procesando mensaje:", e);
      send(ws, { type: 'error', msg: 'Ocurrió un error interno en el servidor.' });
    }
  });

  ws.on('close', async () => {
    try {
      const p = lobby.get(id); if (!p) return;

      const bId = walletToBattle.get(p.wallet);
      const b = battles.get(bId);

      if (p.isGuest && b && !b.isTraining && !b.isCpu && !b.isGauntlet) {
        const winnerId = (id === b.p1id) ? b.p2id : b.p1id;
        const winnerSt = (id === b.p1id) ? b.st2 : b.st1;
        await endBattle(bId, winnerId, id, Math.max(0, winnerSt.hp));
        walletToBattle.delete(p.wallet);
      } 
      else if (b && !b.isTraining && !b.isCpu && !b.isGauntlet) {
        b.dcPlayerId = id; b.dcWallet = p.wallet; b.dcTime = Date.now();
        b.dcTimer = setTimeout(async () => {
          const currentB = battles.get(bId);
          if (currentB && currentB.dcPlayerId === id) {
            const winnerId = (id === currentB.p1id) ? currentB.p2id : currentB.p1id;
            if (currentB.isTeamBattle) {
              const winnerTeam = (id === currentB.p1id) ? currentB.team2 : currentB.team1;
              const hp = winnerTeam.reduce((sum, st) => sum + Math.max(0, st.hp), 0);
              await endTeamBattle(bId, winnerId, id, hp);
            } else {
              const winnerSt = (id === currentB.p1id) ? currentB.st2 : currentB.st1;
              await endBattle(bId, winnerId, id, Math.max(0, winnerSt.hp));
            }
            walletToBattle.delete(p.wallet);
          }
        }, 60000);

        if (b.turnId === id) {
          b.dcTurnTimer = setTimeout(async () => {
            const currentB = battles.get(bId);
            if (currentB && currentB.dcPlayerId === id && currentB.turnId === id) {
              if (currentB.isTeamBattle) await processTeamTurn(bId, id, -1);
              else await processTurn(bId, id, -1);
            }
          }, 15000);
        }

        const oppId = (id === b.p1id) ? b.p2id : b.p1id; const opp = lobby.get(oppId);
        if (opp) send(opp.ws, { type: 'opponent_disconnected', secondsLeft: 60 });
        lobby.delete(id); await pushLobby(); return;
      }

      for (const [bId, b] of battles) {
        if (b.isTraining && (b.p1id === id || b.p2id === id)) { battles.delete(bId); } 
        else if (b.isTeamBattle && (b.p1id === id || b.p2id === id)) { 
          const otherId = b.p1id === id ? b.p2id : b.p1id; 
          const winnerTeam = b.p1id === otherId ? b.team1 : b.team2;
          const winnerRemainingHp = winnerTeam.reduce((sum, st) => sum + Math.max(0, st.hp), 0);
          await endTeamBattle(bId, otherId, id, winnerRemainingHp);
        } 
        else if (b.isGauntlet && b.p2id === id) { await endGauntlet(bId, id, false); } 
        else if (b.isCpu && b.p2id === id) { battles.delete(bId); } 
        else if (b.p1id === id || b.p2id === id) {
          const otherId = b.p1id === id ? b.p2id : b.p1id;
          await endBattle(bId, otherId, id, 0, true);
        }
      }
      lobby.delete(id); await pushLobby();
    } catch(e) {
      console.error("Error en cierre de WebSocket:", e);
    }
  });
});

setTimeout(() => { try { require('./payment-monitor'); } catch(e) { console.error('[ERROR] Monitor:', e.message); } }, 5000);
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Zodiac Battle corriendo en http://localhost:${PORT}`));
