const http = require('http');
const fs   = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const {
  getHP, addHP, isTxProcessed, markTxProcessed,
  getPlatformHp, getPlatformUsdc, clearPlatformHp, setPlatformHp,
  PLATFORM_WALLET, PLATFORM_THRESHOLD, USDC_PER_HP,
  getAllPlayersDebug, adminSetHP, adminResetPlatform, adminUnlockAllHP,
  getPlayerStats, getPlayerRank, getTotalPlayersHP, getExcedente
} = require('./hp-balance');
const { sendUSDC } = require('./transfer');

// Importar el manejador de WebSockets modularizado
const { setupWebSocketServer } = require('./wsHandlers');

const ADMIN_PASS = process.env.ADMIN_PASSWORD || process.env.INTERNAL_SECRET || '';
const OWNER_WALLET = process.env.OWNER_WALLET || ''; 

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
  if (urlPath === '/platform-wallet') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ wallet: PLATFORM_WALLET })); return; }

  if (urlPath === '/admin') {
    fs.readFile(path.join(__dirname, 'admin.html'), (err, data) => {
      if (err) { res.writeHead(500); res.end('Error loading admin panel'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
    return;
  }

  // MODIFICADO: Sincroniza DB con wallet real y devuelve métricas de tesorería
  if (urlPath === '/admin-data') { 
    const pass = new URL(req.url, 'http://localhost').searchParams.get('pass') || ''; 
    if (pass !== ADMIN_PASS) { res.writeHead(403); res.end('Forbidden'); return; } 
    try { 
      const realUsdc = await getPlatformUSDCBalance(); 
      const realHp = Math.floor(realUsdc / USDC_PER_HP); 
      await setPlatformHp(realHp); // Sincroniza el HP en la DB con el balance real de la wallet
      
      const players = await getAllPlayersDebug(); 
      const platformHp = realHp; 
      const playersTotalHp = await getTotalPlayersHP(); 
      const excedente = platformHp - playersTotalHp; 
      
      res.writeHead(200, { 'Content-Type': 'application/json' }); 
      res.end(JSON.stringify({ 
        players, 
        platformHp, 
        platformUsdc: realUsdc, 
        playersTotalHp, 
        playersTotalUsdc: playersTotalHp * USDC_PER_HP, 
        excedente, 
        excedenteUsdc: excedente * USDC_PER_HP 
      })); 
    } catch(e) { 
      console.error("Admin data error:", e);
      res.writeHead(500); res.end('Error'); 
    } 
    return; 
  }
  
  if (urlPath === '/admin-update-hp' && req.method === 'POST') { let body = ''; req.on('data', c => body += c); req.on('end', async () => { try { const { pass, wallet, hp } = JSON.parse(body); if (pass !== ADMIN_PASS) { res.writeHead(403); res.end(JSON.stringify({ ok: false })); return; } await adminSetHP(wallet, parseInt(hp)); res.writeHead(200); res.end(JSON.stringify({ ok: true })); } catch(e) { res.writeHead(400); res.end(JSON.stringify({ ok: false })); } }); return; }
  if (urlPath === '/admin-reset-platform' && req.method === 'POST') { let body = ''; req.on('data', c => body += c); req.on('end', async () => { try { const { pass } = JSON.parse(body); if (pass !== ADMIN_PASS) { res.writeHead(403); res.end(JSON.stringify({ ok: false })); return; } await adminResetPlatform(); res.writeHead(200); res.end(JSON.stringify({ ok: true })); } catch(e) { res.writeHead(400); res.end(JSON.stringify({ ok: false })); } }); return; }
  if (urlPath === '/admin-unlock-hp' && req.method === 'POST') { let body = ''; req.on('data', c => body += c); req.on('end', async () => { try { const { pass } = JSON.parse(body); if (pass !== ADMIN_PASS) { res.writeHead(403); res.end(JSON.stringify({ ok: false })); return; } await adminUnlockAllHP(); res.writeHead(200); res.end(JSON.stringify({ ok: true })); } catch(e) { res.writeHead(400); res.end(JSON.stringify({ ok: false })); } }); return; }
  if (urlPath === '/admin-withdraw' && req.method === 'POST') { let body = ''; req.on('data', c => body += c); req.on('end', async () => { try { const { pass } = JSON.parse(body); if (pass !== ADMIN_PASS) { res.writeHead(403); res.end(JSON.stringify({ ok: false, msg: 'Forbidden' })); return; } if (!OWNER_WALLET) { res.writeHead(400); res.end(JSON.stringify({ ok: false, msg: 'OWNER_WALLET no configurada en el servidor' })); return; } const balance = await getPlatformUSDCBalance(); if (balance <= 0.001) { res.writeHead(400); res.end(JSON.stringify({ ok: false, msg: 'No hay suficientes USDC para retirar' })); return; } const sig = await sendUSDC(OWNER_WALLET, balance); const hpToClear = Math.round(balance / USDC_PER_HP); await clearPlatformHp(hpToClear); res.writeHead(200); res.end(JSON.stringify({ ok: true, amount: balance, sig })); } catch(e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, msg: e.message })); } }); return; }

  if (urlPath === '/hp') { 
    const wallet = new URL(req.url, 'http://localhost').searchParams.get('wallet') || ''; 
    if (wallet.startsWith('guest_')) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ hp: 0, wallet, stats: { wins: 0, losses: 0, rank: null } })); return; } 
    const hp = await getHP(wallet); 
    const stats = await getPlayerStats(wallet); 
    const rank = await getPlayerRank(wallet); 
    res.writeHead(200, { 'Content-Type': 'application/json' }); 
    res.end(JSON.stringify({ hp, wallet, stats: { wins: stats.wins, losses: stats.losses, rank } })); 
    return; 
  }
  
  if (urlPath === '/payment' && req.method === 'POST') { const secret = req.headers['x-internal-secret']; if (secret !== (process.env.INTERNAL_SECRET || 'dev-secret')) { res.writeHead(403); res.end(JSON.stringify({ error: 'Forbidden' })); return; } let body = ''; req.on('data', c => body += c); req.on('end', async () => { try { const { wallet, amount, signature, memo } = JSON.parse(body); if (await isTxProcessed(signature)) { res.writeHead(200); res.end(JSON.stringify({ ok: false, reason: 'duplicate' })); return; } const hp = Math.round((amount / 100_000) * 100); const { broadcast, lobby, send } = require('./state'); const newBalance = await addHP(wallet, hp); lobby.forEach(p => { if (p.wallet === wallet) send(p.ws, { type: 'hp_updated', hp: newBalance }); }); await markTxProcessed(signature); res.writeHead(200); res.end(JSON.stringify({ ok: true, wallet, hp, newBalance })); checkPlatformTransfer(); } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); } }); return; }
  
  const file = urlPath === '/' ? '/index.html' : urlPath;
  const fp = path.join(__dirname, file);
  fs.readFile(fp, (err, data) => { if (err) { res.writeHead(404); res.end('Not found'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' }); res.end(data); });
});

async function checkPlatformTransfer() { const usdc = await getPlatformUsdc(); if (usdc < PLATFORM_THRESHOLD) return; try { const sig = await sendUSDC(PLATFORM_WALLET, usdc); const hpCleared = Math.round(usdc / USDC_PER_HP); await clearPlatformHp(hpCleared); } catch (e) {} }

const wss = new WebSocketServer({ server });

// Inicializar la lógica de WebSockets usando nuestro nuevo módulo
setupWebSocketServer(wss, getPlatformUSDCBalance);

setTimeout(() => { try { require('./payment-monitor'); } catch(e) { console.error('[ERROR] Monitor:', e.message); } }, 5000);
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Zodiac Battle corriendo en http://localhost:${PORT}`));
