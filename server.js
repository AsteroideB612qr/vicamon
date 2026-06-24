const http = require('http');
const fs   = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const {
  getHP, addHP, hasHP, lockHP, unlockHP, settleMatch, cashout,
  getPlatformHp, getPlatformUsdc, clearPlatformHp,
  PLATFORM_WALLET, PLATFORM_THRESHOLD, USDC_PER_HP,
  getAllPlayersDebug // NUEVO: Importamos la función para ver la DB
} = require('./hp-balance');
const { sendUSDC } = require('./transfer');

// Check USDC balance in platform wallet
async function getPlatformUSDCBalance() {
  const { Connection, PublicKey } = require('@solana/web3.js');
  const PLATFORM_TA = '4pxEcSJPaC1baZp8pGtpnwmMCcZnU3T6UrVyv577n3Di';
  const RPCS = [
    'https://api.mainnet-beta.solana.com',
    'https://solana-mainnet.rpc.extrnode.com',
    'https://solana.public-rpc.com',
  ];
  for (const rpc of RPCS) {
    try {
      const conn = new Connection(rpc, 'confirmed');
      const info = await conn.getTokenAccountBalance(new PublicKey(PLATFORM_TA));
      const bal  = parseFloat(info.value.uiAmount || 0);
      return bal;
    } catch(e) {}
  }
  return 0;
}

const MIME = {
  '.html':'text/html', '.js':'application/javascript', '.css':'text/css',
  '.png':'image/png',  '.jpg':'image/jpeg', '.gif':'image/gif',
  '.svg':'image/svg+xml', '.ico':'image/x-icon',
};

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];

  // NUEVO: Ruta secreta para ver la base de datos
  if (urlPath === '/ver-db-secreta') {
    try {
      const players = await getAllPlayersDebug();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(players, null, 2));
    } catch(e) {
      res.writeHead(500); res.end('Error leyendo DB');
    }
    return;
  }

  if (urlPath === '/hp') {
    const wallet = new URL(req.url, 'http://localhost').searchParams.get('wallet') || '';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ hp: await getHP(wallet), wallet }));
    return;
  }

  if (urlPath === '/payment' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { wallet, amount, signature, memo } = JSON.parse(body);
        if (processedTx.has(signature)) {
          res.writeHead(200); res.end(JSON.stringify({ ok: false, reason: 'duplicate' })); return;
        }
        processedTx.add(signature);
        const hp = Math.round((amount / 100_000) * 100);
        const newBalance = await addHP(wallet, hp);
        console.log(`[PAGO] ${wallet.slice(0,8)}... +${hp} HP → total ${newBalance} HP`);
        lobby.forEach(p => {
          if (p.wallet === wallet) send(p.ws, { type: 'hp_updated', hp: newBalance });
        });
        res.writeHead(200); res.end(JSON.stringify({ ok: true, wallet, hp, newBalance }));
        checkPlatformTransfer();
      } catch (e) {
        res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  const file    = urlPath === '/' ? '/index.html' : urlPath;
  const fp      = path.join(__dirname, file);
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss        = new WebSocketServer({ server });
const lobby      = new Map();
const battles    = new Map();
const processedTx= new Set();
let   nextId     = 1;
function uid() { return nextId++; }

function send(ws, obj)  { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function broadcast(obj) { lobby.forEach(p => send(p.ws, obj)); }

async function lobbyList() {
  const list = [];
  for (const [id, p] of lobby) {
    if (!p.inBattle) {
      list.push({ id, name: p.name, beast: p.beast, hp: await getHP(p.wallet) });
    }
  }
  return list;
}
async function pushLobby() { broadcast({ type: 'lobby', players: await lobbyList() }); }

function pushBattle(bId) {
  const b = battles.get(bId); if (!b) return;
  const p1 = lobby.get(b.p1id), p2 = lobby.get(b.p2id);
  if (!p1 || !p2) return;
  
  const base = { type: 'battle_state', battleId: bId,
    p1: { name: p1.name, beast: p1.beast, state: b.st1 },
    p2: { name: p2.name, beast: p2.beast, state: b.st2 },
    logs: b.logs.slice(-14) };
  send(p1.ws, { ...base, yourTurn: b.turnId === b.p1id });
  send(p2.ws, { ...base, yourTurn: b.turnId === b.p2id });
}

async function checkPlatformTransfer() {
  const usdc = await getPlatformUsdc();
  if (usdc < PLATFORM_THRESHOLD) return;
  try {
    const sig = await sendUSDC(PLATFORM_WALLET, usdc);
    const hpCleared = Math.round(usdc / USDC_PER_HP);
    await clearPlatformHp(hpCleared);
  } catch (e) {}
}

function newState() {
  return { hp:100, maxHp:100, poisonDmg:0, poisonTurns:0, burnDmg:0, burnTurns:0,
    shield:0, shieldReflect:0, reflect50:0, stun:false, recharge:0,
    regen:0, regenTurns:0, blind:0, weakAtk:0, weaken:0,
    corrode:0, analyzed:0, lastDmgReceived:0 };
}

const BEASTS = {
  aries:      { attacks:[{d:32,acc:72, self:8, fx:null,pierce:true},{d:20,acc:100,self:0,fx:null},         {d:48,acc:50, self:18,fx:null},      {d:25,acc:85, self:0,fx:'stun'}]},
  tauro:      { attacks:[{d:0, acc:100,self:0, fx:'shield3'},        {d:22,acc:88, self:0,fx:'slow'},       {d:0, acc:100,self:0,fx:'heal28'},   {d:35,acc:65, self:0,fx:null}]},
  geminis:    { attacks:[{d:14,acc:90, self:0, fx:'double'},         {d:0, acc:100,self:0,fx:'swap'},       {d:18,acc:100,self:0,fx:'blind'},    {d:0, acc:95, self:0,fx:'chaos'}]},
  cancer:     { attacks:[{d:0, acc:100,self:0, fx:'shield2r'},       {d:15,acc:100,self:0,fx:'drain12'},    {d:20,acc:85, self:0,fx:'slow2'},    {d:28,acc:70, self:0,fx:'shieldbonus'}]},
  leo:        { attacks:[{d:0, acc:100,self:0, fx:'weaken'},         {d:28,acc:88, self:0,fx:'weakbonus'},  {d:20,acc:100,self:0,fx:'burn'},     {d:42,acc:62, self:0,fx:null}]},
  virgo:      { attacks:[{d:0, acc:100,self:0, fx:'analyze'},        {d:24,acc:88, self:0,fx:null,pierce:true},{d:0,acc:100,self:0,fx:'purify'}, {d:35,acc:70, self:0,fx:'stateBonus'}]},
  libra:      { attacks:[{d:0, acc:100,self:0, fx:'equalize'},       {d:0, acc:100,self:0,fx:'counter'},    {d:25,acc:85, self:0,fx:'lowHPbonus'},{d:30,acc:75,self:0,fx:'stun_ifless'}]},
  escorpio:   { attacks:[{d:6, acc:100,self:0, fx:'poison5'},        {d:22,acc:85, self:0,fx:'poisonBonus'},{d:10,acc:100,self:0,fx:'corrode'}, {d:35,acc:65, self:0,fx:'poisonDouble'}]},
  sagitario:  { attacks:[{d:26,acc:92, self:0, fx:null},             {d:45,acc:62, self:0,fx:'recharge'},   {d:10,acc:80, self:0,fx:'triple'},   {d:30,acc:75, self:0,fx:'random_fx'}]},
  capricornio:{ attacks:[{d:0, acc:100,self:0, fx:'fortress'},       {d:28,acc:78, self:0,fx:'weakAtk'},    {d:0, acc:100,self:0,fx:'reflect50'},{d:40,acc:58,self:0,fx:null}]},
  acuario:    { attacks:[{d:0, acc:88, self:0, fx:'chaosHi'},        {d:18,acc:100,self:0,fx:'stun_blind'}, {d:55,acc:48, self:0,fx:'overload'}, {d:20,acc:95, self:0,fx:'random_fx'}]},
  piscis:     { attacks:[{d:22,acc:85, self:0, fx:'poison3l'},       {d:0, acc:100,self:0,fx:'heal35'},     {d:15,acc:100,self:0,fx:'selfheal10'},{d:38,acc:63,self:0,fx:'lowHPx15'}]},
};
const BEAST_KEYS = Object.keys(BEASTS);

function applyAtk(aSt, dSt, atk, aName) {
  const logs = [];
  const blind   = aSt.blind   > 0 ? 30  : 0;
  const weakMul = aSt.weakAtk > 0 ? 0.8 : 1;
  const anaMul  = aSt.analyzed> 0 ? 1.15: 1;
  const fx = atk.fx;

  if (fx==='shield3')  { aSt.shield=3; aSt.shieldReflect=0;  logs.push({t:`${aName} activa Escudo ×3`,c:'good'}); return logs; }
  if (fx==='shield2r') { aSt.shield=2; aSt.shieldReflect=12; logs.push({t:`${aName} activa Escudo Lunar`,c:'good'}); return logs; }
  if (fx==='reflect50'){ aSt.reflect50=1; logs.push({t:`${aName} prepara Reflejo 50%`,c:'good'}); return logs; }
  if (fx==='heal28')   { aSt.hp=Math.min(aSt.maxHp,aSt.hp+28); logs.push({t:`${aName} se cura 28 HP`,c:'good'}); return logs; }
  if (fx==='heal35')   { aSt.hp=Math.min(aSt.maxHp,aSt.hp+35); logs.push({t:`${aName} se cura 35 HP`,c:'good'}); return logs; }
  if (fx==='fortress') { aSt.shield=2; aSt.hp=Math.min(aSt.maxHp,aSt.hp+20); aSt.regen=8; aSt.regenTurns=2; logs.push({t:`${aName} activa Fortaleza`,c:'good'}); return logs; }
  if (fx==='analyze')  { aSt.analyzed=3; logs.push({t:`${aName} analiza al rival`,c:'good'}); return logs; }
  if (fx==='purify')   { aSt.poisonTurns=aSt