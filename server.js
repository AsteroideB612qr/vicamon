const http = require('http');
const fs   = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const {
  getHP, addHP, hasHP, lockHP, unlockHP, settleMatch, cashout,
  getPlatformHp, getPlatformUsdc, clearPlatformHp,
  PLATFORM_WALLET, PLATFORM_THRESHOLD, USDC_PER_HP,
  getAllPlayersDebug, updatePlayerName, updatePlayerStats, getTopPlayers // NUEVO
} = require('./hp-balance');
const { sendUSDC } = require('./transfer');
const BEASTS = require('./beasts.js');
const BEAST_KEYS = Object.keys(BEASTS);

// [Se omite el código de getPlatformUSDCBalance y MIME para acortar, NO LO BORRES]
async function getPlatformUSDCBalance() {
  const { Connection, PublicKey } = require('@solana/web3.js');
  const PLATFORM_TA = '4pxEcSJPaC1baZp8pGtpnwmMCcZnU3T6UrVyv577n3Di';
  const RPCS = ['https://api.mainnet-beta.solana.com', 'https://solana-mainnet.rpc.extrnode.com', 'https://solana.public-rpc.com'];
  for (const rpc of RPCS) { try { const conn = new Connection(rpc, 'confirmed'); const info = await conn.getTokenAccountBalance(new PublicKey(PLATFORM_TA)); return parseFloat(info.value.uiAmount || 0); } catch(e) {} }
  return 0;
}
const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.gif':'image/gif', '.svg':'image/svg+xml', '.ico':'image/x-icon' };

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];
  if (urlPath === '/ver-db-secreta') { try { const players = await getAllPlayersDebug(); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(players, null, 2)); } catch(e) { res.writeHead(500); res.end('Error leyendo DB'); } return; }
  if (urlPath === '/hp') { const wallet = new URL(req.url, 'http://localhost').searchParams.get('wallet') || ''; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ hp: await getHP(wallet), wallet })); return; }
  if (urlPath === '/payment' && req.method === 'POST') { /* ... código de pago intacto ... */ }

  const file = urlPath === '/' ? '/index.html' : urlPath;
  const fp = path.join(__dirname, file);
  fs.readFile(fp, (err, data) => { if (err) { res.writeHead(404); res.end('Not found'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' }); res.end(data); });
});

const wss = new WebSocketServer({ server });
const lobby = new Map();
const battles = new Map();
const processedTx = new Set();
let nextId = 1; function uid() { return nextId++; }
function send(ws, obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function broadcast(obj) { lobby.forEach(p => send(p.ws, obj)); }

async function lobbyList() { const list = []; for (const [id, p] of lobby) { if (!p.inBattle) list.push({ id, name: p.name, beast: p.beast, hp: await getHP(p.wallet) }); } return list; }
async function pushLobby() { broadcast({ type: 'lobby', players: await lobbyList() }); }

// [Se omite pushBattle, checkPlatformTransfer, newState, getStartState, applyAtk, tickEffects para acortar, NO LOS BORRES]
function pushBattle(bId) { /* ... intacto ... */ }
async function checkPlatformTransfer() { /* ... intacto ... */ }
function newState() { return { hp:100, maxHp:100, poisonDmg:0, poisonTurns:0, burnDmg:0, burnTurns:0, shield:0, shieldReflect:0, reflect50:0, stun:false, recharge:0, regen:0, regenTurns:0, blind:0, weakAtk:0, weaken:0, corrode:0, analyzed:0, lastDmgReceived:0, pp:[] }; }
function getStartState(beastKey) { /* ... intacto ... */ }
function applyAtk(aSt, dSt, atk, aName) { /* ... intacto ... */ }
function tickEffects(st, name) { /* ... intacto ... */ }

async function endBattle(bId, winnerId, loserId, winnerHp, forfeit=false) {
  const b = battles.get(bId);
  const isCpu = b?.isCpu || false;
  const isTraining = b?.isTraining || false;
  const winner = lobby.get(winnerId);
  const loser = lobby.get(loserId);
  const hp = forfeit ? 100 : Math.max(0, Math.min(100, winnerHp));

  if (isTraining) {
    /* ... intacto ... */
  } else if (isCpu) {
    /* ... intacto ... */
  } else {
    const winnerWallet = winner?.wallet || '';
    const loserWallet = loser?.wallet || '';
    const result = await settleMatch(winnerWallet, loserWallet, hp);
    
    // NUEVO: Actualizar estadísticas de victorias/derrotas
    await updatePlayerStats(winnerWallet, loserWallet);
    
    const winnerUsdc = parseFloat(((100 + hp) * USDC_PER_HP).toFixed(3));
    const platformUsdc = parseFloat(((100 - hp) * USDC_PER_HP).toFixed(3));
    send(winner?.ws, { type:'battle_end', won:true, isCpu:false, winnerHp:hp, winnerUsdc, platformUsdc, newHp: result.winnerNewHp, forfeit });
    send(loser?.ws, { type:'battle_end', won:false, isCpu:false, winnerHp:hp, winnerUsdc, platformUsdc, newHp: await getHP(loserWallet) });
    checkPlatformTransfer();
    
    // NUEVO: Avisar a todos en el lobby que el ranking actualizó
    const top = await getTopPlayers(3);
    broadcast({ type: 'leaderboard_update', top });
  }

  if (winner) winner.inBattle = false;
  if (loser) loser.inBattle = false;
  battles.delete(bId);
  await pushLobby();
}

// [Se omite el resto de funciones de batalla para acortar, NO LAS BORRES]
async function checkDeath(bId, isP1Attacker) { /* ... intacto ... */ }
async function processTurn(bId, attackerId, atkIndex) { /* ... intacto ... */ }
function autoResolveIfBlocked(bId) { /* ... intacto ... */ }
const CPU_NAME='Zodiac Master', CPU_ID=-1;
function cpuPickAttack(cpuSt, oppSt, beastKey) { /* ... intacto ... */ }
function scheduleCpuTurn(bId) { /* ... intacto ... */ }
function pushCpuBattle(bId) { /* ... intacto ... */ }
async function checkCpuDeath(bId) { /* ... intacto ... */ }
async function doCpuTurn(bId) { /* ... intacto ... */ }
async function processCpuPlayerTurn(bId, playerId, atkIndex) { /* ... intacto ... */ }

wss.on('connection', ws => {
  const id = uid();

  ws.on('message', async raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join') {
      const wallet = msg.wallet || '';
      for (const [oldId, p] of lobby) {
        if (p.wallet === wallet && oldId !== id) {
          send(p.ws, { type:'kicked', msg:'Tu wallet se conectó en otra pestaña.' });
          if (!p.inBattle) lobby.delete(oldId);
          try { p.ws.close(); } catch(e) {}
        }
      }

      lobby.set(id, {ws, name:msg.name, beast:msg.beast, wallet, inBattle:false, id});
      
      // NUEVO: Guardar el nombre del jugador en la DB
      await updatePlayerName(wallet, msg.name);
      
      const hp = await getHP(wallet);
      send(ws, {type:'joined', id, hp});
      
      // NUEVO: Enviar el ranking actual al jugador que entra
      const top = await getTopPlayers(3);
      send(ws, { type: 'leaderboard_update', top });
      
      await pushLobby();
    }

    // [Se omite el resto de eventos de WebSocket para acortar, NO LOS BORRES]
    if (msg.type === 'change_beast') { /* ... */ }
    if (msg.type === 'challenge') { /* ... */ }
    if (msg.type === 'challenge_training') { /* ... */ }
    if (msg.type === 'accept') { /* ... */ }
    if (msg.type === 'attack') { /* ... */ }
    if (msg.type === 'challenge_cpu') { /* ... */ }
    if (msg.type === 'cashout') { /* ... */ }
    if (msg.type === 'chat_message') { /* ... */ }
    if (msg.type === 'ping') { /* ... */ }
    if (msg.type === 'leave_lobby') { /* ... */ }
  });

  ws.on('close', async () => {
    /* ... intacto ... */
  });
});

setTimeout(() => { try { require('./payment-monitor'); } catch(e) { console.error('[ERROR] No se pudo iniciar el monitor de pagos:', e.message); } }, 5000);
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Zodiac Battle corriendo en http://localhost:${PORT}`));
