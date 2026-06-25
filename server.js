const http = require('http');
const fs   = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const {
  getHP, addHP, hasHP, lockHP, unlockHP, settleMatch, cashout,
  getPlatformHp, getPlatformUsdc, clearPlatformHp,
  PLATFORM_WALLET, PLATFORM_THRESHOLD, USDC_PER_HP,
  getAllPlayersDebug
} = require('./hp-balance');
const { sendUSDC } = require('./transfer');

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
      return parseFloat(info.value.uiAmount || 0);
    } catch(e) {}
  }
  return 0;
}

const MIME = {
  '.html':'text/html', '.js':'application/javascript', '.css':'text/css',
  '.png':'image/png',  '.jpg':'image/jpeg', '.gif':'image/gif',
  '.svg':'image/svg+xml', '.ico':'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];

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
  aries:      { attacks:[{d:32,acc:72, self:8, fx:null,pierce:true},{d:20,acc:100,self:0,fx:null},{d:48,acc:50, self:18,fx:null},{d:25,acc:85, self:0,fx:'stun'}]},
  tauro:      { attacks:[{d:0, acc:100,self:0, fx:'shield3'},{d:22,acc:88, self:0,fx:'slow'},{d:0, acc:100,self:0,fx:'heal28'},{d:35,acc:65, self:0,fx:null}]},
  geminis:    { attacks:[{d:14,acc:90, self:0, fx:'double'},{d:0, acc:100,self:0,fx:'swap'},{d:18,acc:100,self:0,fx:'blind'},{d:0, acc:95, self:0,fx:'chaos'}]},
  cancer:     { attacks:[{d:0, acc:100,self:0, fx:'shield2r'},{d:15,acc:100,self:0,fx:'drain12'},{d:20,acc:85, self:0,fx:'slow2'},{d:28,acc:70, self:0,fx:'shieldbonus'}]},
  leo:        { attacks:[{d:0, acc:100,self:0, fx:'weaken'},{d:28,acc:88, self:0,fx:'weakbonus'},{d:20,acc:100,self:0,fx:'burn'},{d:42,acc:62, self:0,fx:null}]},
  virgo:      { attacks:[{d:0, acc:100,self:0, fx:'analyze'},{d:24,acc:88, self:0,fx:null,pierce:true},{d:0,acc:100,self:0,fx:'purify'},{d:35,acc:70, self:0,fx:'stateBonus'}]},
  libra:      { attacks:[{d:0, acc:100,self:0, fx:'equalize'},{d:0, acc:100,self:0,fx:'counter'},{d:25,acc:85, self:0,fx:'lowHPbonus'},{d:30,acc:75,self:0,fx:'stun_ifless'}]},
  escorpio:   { attacks:[{d:6, acc:100,self:0, fx:'poison5'},{d:22,acc:85, self:0,fx:'poisonBonus'},{d:10,acc:100,self:0,fx:'corrode'},{d:35,acc:65, self:0,fx:'poisonDouble'}]},
  sagitario:  { attacks:[{d:26,acc:92, self:0, fx:null},{d:45,acc:62, self:0,fx:'recharge'},{d:10,acc:80, self:0,fx:'triple'},{d:30,acc:75, self:0,fx:'random_fx'}]},
  capricornio:{ attacks:[{d:0, acc:100,self:0, fx:'fortress'},{d:28,acc:78, self:0,fx:'weakAtk'},{d:0, acc:100,self:0,fx:'reflect50'},{d:40,acc:58,self:0,fx:null}]},
  acuario:    { attacks:[{d:0, acc:88, self:0, fx:'chaosHi'},{d:18,acc:100,self:0,fx:'stun_blind'},{d:55,acc:48, self:0,fx:'overload'},{d:20,acc:95, self:0,fx:'random_fx'}]},
  piscis:     { attacks:[{d:22,acc:85, self:0, fx:'poison3l'},{d:0, acc:100,self:0,fx:'heal35'},{d:15,acc:100,self:0,fx:'selfheal10'},{d:38,acc:63,self:0,fx:'lowHPx15'}]},
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
  
  if (fx==='purify') {
    aSt.poisonTurns = aSt.burnTurns = aSt.blind = aSt.weakAtk = aSt.weaken = 0;
    aSt.stun = false;
    aSt.hp = Math.min(aSt.maxHp, aSt.hp + 15);
    logs.push({t: `${aName} se purifica +15 HP`, c: 'good'});
    return logs;
  }
  
  if (fx==='weaken')   { dSt.weaken=2; logs.push({t:`${aName} debilita al rival`,c:'special'}); return logs; }
  if (fx==='counter')  { const h=aSt.lastDmgReceived||0; aSt.hp=Math.min(aSt.maxHp,aSt.hp+h); logs.push({t:`${aName} usa Contrapeso: +${h} HP`,c:'good'}); return logs; }
  if (fx==='swap')     { const tp=dSt.stun; dSt.stun=aSt.stun; aSt.stun=tp; logs.push({t:`${aName} intercambia estados`,c:'special'}); return logs; }
  if (fx==='equalize') { const diff=Math.abs(aSt.hp-dSt.hp); dSt.hp=Math.max(0,dSt.hp-diff); logs.push({t:`${aName} → Equilibrio: ${diff} HP`,c:'bad'}); return logs; }

  if (fx==='chaos'||fx==='chaosHi') {
    if (Math.random()*100 >= atk.acc-blind) { logs.push({t:`${aName} → ¡falló!`,c:'bad'}); return logs; }
    const dmg=fx==='chaosHi'?Math.floor(Math.random()*41)+10:Math.floor(Math.random()*41)+5;
    dSt.hp=Math.max(0,dSt.hp-dmg);
    logs.push({t:`${aName} → Caos: ${dmg} HP`,c:'bad'}); return logs;
  }

  const hit = Math.random()*100 < Math.max(5, atk.acc-blind);
  if (!hit) {
    if (fx==='overload') { aSt.hp=Math.max(0,aSt.hp-25); logs.push({t:`${aName} → Sobrecarga falló! -25 HP`,c:'bad'}); }
    else logs.push({t:`${aName} → ¡falló!`,c:'bad'});
    return logs;
  }

  if (atk.d > 0 && !atk.pierce) {
    if (dSt.shield > 0) {
      dSt.shield--;
      const ref=dSt.shieldReflect||0;
      if (ref>0) { aSt.hp=Math.max(0,aSt.hp-ref); logs.push({t:`¡Escudo! Bloqueado — refleja ${ref} HP`,c:'special'}); }
      else logs.push({t:`¡Escudo! Ataque bloqueado`,c:'special'});
      return logs;
    }
    if (dSt.reflect50 > 0) {
      dSt.reflect50=0;
      const ref=Math.floor(atk.d*0.5);
      aSt.hp=Math.max(0,aSt.hp-ref);
      logs.push({t:`¡Reflejo! Devuelve ${ref} HP`,c:'special'}); return logs;
    }
  }

  let dmg=atk.d;
  if (fx==='double')       dmg=atk.d*2;
  if (fx==='triple')       dmg=atk.d*3;
  if (fx==='drain12')      { dmg=15; aSt.hp=Math.min(aSt.maxHp,aSt.hp+12); }
  if (fx==='selfheal10')   aSt.hp=Math.min(aSt.maxHp,aSt.hp+10);
  if (fx==='shieldbonus' && dSt.shield>0) dmg+=10;
  if (fx==='weakbonus'   && dSt.weaken>0) dmg+=10;
  if (fx==='stateBonus'  && (dSt.poisonTurns>0||dSt.burnTurns>0||dSt.stun||dSt.blind>0)) dmg+=10;
  if (fx==='poisonBonus')  dmg+=(dSt.poisonTurns||0)*5;
  if (fx==='poisonDouble'&&dSt.poisonTurns>0) dmg*=2;
  if (fx==='lowHPbonus'  &&aSt.hp<dSt.hp)  dmg+=10;
  if (fx==='lowHPx15'    &&aSt.hp<aSt.maxHp*0.3) dmg=Math.floor(dmg*1.5);
  if (dSt.weaken>0) dmg=Math.floor(dmg*1.25);
  dmg=Math.floor(dmg*weakMul*anaMul);

  dSt.hp=Math.max(0,dSt.hp-dmg);
  dSt.lastDmgReceived=dmg;
  if (atk.self>0) aSt.hp=Math.max(0,aSt.hp-atk.self);

  let extra='';
  if (fx==='poison5')    { dSt.poisonDmg=8;  dSt.poisonTurns=5;  extra=' ☠ Veneno!'; }
  if (fx==='poison3l')   { dSt.poisonDmg=3;  dSt.poisonTurns=3;  extra=' ☠ Veneno leve!'; }
  if (fx==='corrode')    { dSt.corrode=3;  extra=' ¡Corroído!'; }
  if (fx==='burn')       { dSt.burnDmg=6;  dSt.burnTurns=2;  extra=' 🔥 Quema!'; }
  if (fx==='stun')       { dSt.stun=true;  extra=' 💫 ¡Aturdido!'; }
  if (fx==='stun_blind') { dSt.stun=true; dSt.blind=2; extra=' 💫+👁'; }
  if (fx==='stun_ifless'&&dSt.hp>aSt.hp) { dSt.stun=true; extra=' 💫 ¡Sentenciado!'; }
  if (fx==='slow'||fx==='slow2') { dSt.blind=(fx==='slow2'?2:1); extra=' Ralentizado!'; }
  if (fx==='blind')      { dSt.blind=2;  extra=' 👁 Cegado!'; }
  if (fx==='weakAtk')    { dSt.weakAtk=2; extra=' ⬇ -20% atk!'; }
  if (fx==='recharge')   { aSt.recharge=1; extra=' (recargando)'; }
  if (fx==='random_fx')  {
    const opts=['poison','stun','blind','weakAtk'];
    const r=opts[Math.floor(Math.random()*opts.length)];
    if(r==='poison'){dSt.poisonDmg=5;dSt.poisonTurns=3;extra=' +☠';}
    if(r==='stun'){dSt.stun=true;extra=' +💫';}
    if(r==='blind'){dSt.blind=2;extra=' +👁';}
    if(r==='weakAtk'){dSt.weakAtk=2;extra=' +⬇atk';}
  }
  const selfNote=atk.self>0?` (-${atk.self} propio)`:'';
  const healNote=fx==='drain12'?' (drena 12)':fx==='selfheal10'?' (+10 propio)':'';
  logs.push({t:`${aName} → ${dmg} HP${selfNote}${healNote}${extra}`,c:dmg>25?'bad':'normal'});
  return logs;
}

function tickEffects(st, name) {
  const logs=[];
  if (st.poisonTurns>0){ st.hp=Math.max(0,st.hp-st.poisonDmg); st.poisonTurns--; logs.push({t:`${name} sufre ${st.poisonDmg} HP veneno`,c:'special'}); }
  if (st.burnTurns>0)  { st.hp=Math.max(0,st.hp-st.burnDmg);   st.burnTurns--;   logs.push({t:`${name} sufre ${st.burnDmg} HP quema`,c:'special'}); }
  if (st.regenTurns>0) { st.hp=Math.min(st.maxHp,st.hp+st.regen); st.regenTurns--; logs.push({t:`${name} regenera ${st.regen} HP`,c:'good'}); }
  if (st.blind>0)   st.blind--;
  if (st.weakAtk>0) st.weakAtk--;
  if (st.weaken>0)  st.weaken--;
  if (st.corrode>0) st.corrode--;
  if (st.analyzed>0)st.analyzed--;
  return logs;
}

async function endBattle(bId, winnerId, loserId, winnerHp, forfeit=false) {
  const b      = battles.get(bId);
  const isCpu  = b?.isCpu || false;
  const isTraining = b?.isTraining || false;
  const winner = lobby.get(winnerId);
  const loser  = lobby.get(loserId);
  const hp     = forfeit ? 100 : Math.max(0, Math.min(100, winnerHp));

  if (isTraining) {
    const winnerXp = forfeit ? 0 : Math.max(0, Math.min(100, winnerHp));
    const loserXp = 0;
    send(winner?.ws, { type:'battle_end', won:true, isTraining:true, winnerXp, loserXp, forfeit });
    send(loser?.ws, { type:'battle_end', won:false, isTraining:true, winnerXp, loserXp });
  } else if (isCpu) {
    const winnerXp = forfeit ? 0 : Math.max(0, Math.min(100, winnerHp));
    send(winner?.ws, { type:'battle_end', won:true, isCpu:true, winnerXp, loserXp:0, winnerHp:hp, forfeit });
    send(loser?.ws, { type:'battle_end', won:false, isCpu:true, winnerXp, loserXp:0, winnerHp:hp });
  } else {
    const winnerWallet = winner?.wallet || '';
    const loserWallet  = loser?.wallet  || '';
    const result = await settleMatch(winnerWallet, loserWallet, hp);
    const winnerUsdc  = parseFloat(((100 + hp) * USDC_PER_HP).toFixed(3));
    const platformUsdc= parseFloat(((100 - hp) * USDC_PER_HP).toFixed(3));
    send(winner?.ws, { type:'battle_end', won:true, isCpu:false, winnerHp:hp, winnerUsdc, platformUsdc, newHp: result.winnerNewHp, forfeit });
    send(loser?.ws, { type:'battle_end', won:false, isCpu:false, winnerHp:hp, winnerUsdc, platformUsdc, newHp: await getHP(loserWallet) });
    checkPlatformTransfer();
  }

  if (winner) winner.inBattle=false;
  if (loser)  loser.inBattle=false;
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

  const isP1   = b.p1id===attackerId;
  const aSt    = isP1 ? b.st1 : b.st2;
  const dSt    = isP1 ? b.st2 : b.st1;
  const aPlayer= lobby.get(attackerId);
  const dPlayer= lobby.get(isP1 ? b.p2id : b.p1id);
  if (!aPlayer||!dPlayer) return true;

  b.logs.push(...tickEffects(aSt, aPlayer.name));
  if (await checkDeath(bId, isP1)) return true;

  if (aSt.stun) {
    aSt.stun=false;
    b.logs.push({t:`${aPlayer.name} aturdido — pierde turno`,c:'special'});
  } else if (aSt.recharge>0) {
    aSt.recharge--;
    b.logs.push({t:`${aPlayer.name} recargando${aSt.recharge>0?` (${aSt.recharge} más)`:'... ¡listo!'}`,c:'special'});
  } else if (atkIndex >= 0) {
    const atks=BEASTS[aPlayer.beast]?.attacks;
    const atk=atks?.[atkIndex];
    if (!atk) return false;
    b.logs.push(...applyAtk(aSt,dSt,atk,aPlayer.name));
    if (await checkDeath(bId, isP1)) return true;
  }

  b.turnId = isP1 ? b.p2id : b.p1id;
  pushBattle(bId);
  autoResolveIfBlocked(bId);
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

const CPU_NAME='Zodiac Master', CPU_ID=-1;

function cpuPickAttack(cpuSt, oppSt, beastKey) {
  const atks=BEASTS[beastKey]?.attacks||[];
  const w=atks.map(a=>{
    let s=2;
    if (a.d>30 && oppSt.hp<40) s=5;
    if ((a.fx==='poison5'||a.fx==='poison3l') && oppSt.poisonTurns===0 && oppSt.hp>40) s=4;
    if ((a.fx==='heal28'||a.fx==='heal35'||a.fx==='fortress') && cpuSt.hp<35) s=5;
    if ((a.fx==='shield3'||a.fx==='shield2r') && cpuSt.hp<45 && cpuSt.shield===0) s=4;
    if (a.fx==='poisonDouble' && oppSt.poisonTurns>0) s=6;
    if (a.fx==='recharge' && cpuSt.recharge===0 && oppSt.hp>60) s=1;
    return s;
  });
  const tot=w.reduce((a,b)=>a+b,0);
  let r=Math.random()*tot, idx=0;
  for (let i=0;i<w.length;i++){r-=w[i];if(r<=0){idx=i;break;}}
  return idx;
}

function scheduleCpuTurn(bId) {
  const b=battles.get(bId); if (!b||!b.isCpu||b.turnId!==CPU_ID) return;
  setTimeout(async ()=>{ const bb=battles.get(bId); if(!bb||bb.turnId!==CPU_ID) return; await doCpuTurn(bId); }, 1100+Math.random()*600);
}

function pushCpuBattle(bId) {
  const b=battles.get(bId); if (!b) return;
  const pl=lobby.get(b.cpuIsP1 ? b.p2id : b.p1id); if (!pl) return;
  const cpuSide={name:CPU_NAME, beast:b.cpuBeast, state:b.cpuIsP1?b.st1:b.st2};
  const plSide ={name:pl.name,  beast:pl.beast,   state:b.cpuIsP1?b.st2:b.st1};
  send(pl.ws, { type:'battle_state', battleId:bId,
    p1: b.cpuIsP1 ? cpuSide : plSide,
    p2: b.cpuIsP1 ? plSide  : cpuSide,
    logs: b.logs.slice(-14),
    yourTurn: b.turnId !== CPU_ID });
}

async function checkCpuDeath(bId) {
  const b=battles.get(bId); if (!b) return false;
  const cpuSt=b.cpuIsP1?b.st1:b.st2;
  const plSt =b.cpuIsP1?b.st2:b.st1;
  const plId =b.cpuIsP1?b.p2id:b.p1id;
  if (cpuSt.hp<=0) { await endBattle(bId, plId,  CPU_ID, Math.max(0,plSt.hp));  return true; }
  if (plSt.hp<=0)  { await endBattle(bId, CPU_ID, plId,  Math.max(0,cpuSt.hp)); return true; }
  return false;
}

async function doCpuTurn(bId) {
  const b=battles.get(bId); if (!b) return;
  const cpuSt=b.cpuIsP1?b.st1:b.st2;
  const plSt =b.cpuIsP1?b.st2:b.st1;
  const plId =b.cpuIsP1?b.p2id:b.p1id;
  const pl=lobby.get(plId); if (!pl) return;

  b.logs.push(...tickEffects(cpuSt, CPU_NAME));
  if (await checkCpuDeath(bId)) return;

  if (cpuSt.stun)       { cpuSt.stun=false; b.logs.push({t:`${CPU_NAME} aturdido — pierde turno`,c:'special'}); }
  else if (cpuSt.recharge>0) { cpuSt.recharge--; b.logs.push({t:`${CPU_NAME} recargando...`,c:'special'}); }
  else {
    const idx=cpuPickAttack(cpuSt, plSt, b.cpuBeast);
    const atk=BEASTS[b.cpuBeast].attacks[idx];
    b.logs.push(...applyAtk(cpuSt, plSt, atk, CPU_NAME));
    if (await checkCpuDeath(bId)) return;
  }

  b.turnId=plId;
  pushCpuBattle(bId);

  const bb=battles.get(bId); if (!bb) return;
  const plStNow=b.cpuIsP1?bb.st2:bb.st1;
  if (plStNow.stun||plStNow.recharge>0) {
    setTimeout(async ()=>{ const bbb=battles.get(bId); if(!bbb||bbb.turnId!==plId) return; await processCpuPlayerTurn(bId,plId,-1); }, 900);
  }
}

async function processCpuPlayerTurn(bId, playerId, atkIndex) {
  const b=battles.get(bId); if (!b||!b.isCpu||b.turnId!==playerId) return;
  const plIsP1=!b.cpuIsP1;
  const plSt =plIsP1?b.st1:b.st2;
  const cpuSt=plIsP1?b.st2:b.st1;
  const pl=lobby.get(playerId); if (!pl) return;

  b.logs.push(...tickEffects(plSt, pl.name));
  if (await checkCpuDeath(bId)) return;

  if (plSt.stun)        { plSt.stun=false; b.logs.push({t:`${pl.name} aturdido — pierde turno`,c:'special'}); }
  else if (plSt.recharge>0) { plSt.recharge--; b.logs.push({t:`${pl.name} recargando...`,c:'special'}); }
  else if (atkIndex >= 0) {
    const atks=BEASTS[pl.beast]?.attacks;
    const atk=atks?.[atkIndex]; if (!atk) return;
    b.logs.push(...applyAtk(plSt,cpuSt,atk,pl.name));
    if (await checkCpuDeath(bId)) return;
  }

  b.turnId=CPU_ID;
  pushCpuBattle(bId);
  scheduleCpuTurn(bId);
}

wss.on('connection', ws => {
  const id=uid();

  ws.on('message', async raw => {
    let msg; try { msg=JSON.parse(raw); } catch { return; }

    if (msg.type==='join') {
      const wallet = msg.wallet||'';
      
      // EVITAR PESTAÑAS DUPLICADAS
      for (const [oldId, p] of lobby) {
        if (p.wallet === wallet && oldId !== id) {
          send(p.ws, { type:'kicked', msg:'Tu wallet se conectó en otra pestaña. Esta sesión se cerrará.' });
          if (!p.inBattle) lobby.delete(oldId);
          try { p.ws.close(); } catch(e) {}
        }
      }

      lobby.set(id,{ws,name:msg.name,beast:msg.beast,wallet,inBattle:false,id});
      const hp = await getHP(wallet);
      send(ws,{type:'joined',id,hp});
      await pushLobby();
    }

    if (msg.type==='change_beast') {
      const p=lobby.get(id);
      if (p&&!p.inBattle){p.beast=msg.beast;await pushLobby();}
    }

    if (msg.type==='challenge') {
      const challenger=lobby.get(id);
      const target=lobby.get(msg.targetId);
      if (!challenger||!target||target.inBattle||challenger.inBattle) return;
      const challengerHP = await getHP(challenger.wallet);
      const targetHP     = await getHP(target.wallet);
      if (challengerHP < 100) { send(ws,{type:'error',msg:`Necesitas al menos 100 HP para retar. Tienes ${challengerHP} HP.`}); return; }
      if (targetHP     < 100) { send(ws,{type:'error',msg:`Ese jugador solo tiene ${targetHP} HP, necesita mínimo 100 HP.`}); return; }
      send(target.ws,{type:'challenged',fromId:id,fromName:challenger.name,fromBeast:challenger.beast, isTraining:false});
    }

    if (msg.type==='challenge_training') {
      const challenger=lobby.get(id);
      const target=lobby.get(msg.targetId);
      if (!challenger||!target||target.inBattle||challenger.inBattle) return;
      send(target.ws,{type:'challenged',fromId:id,fromName:challenger.name,fromBeast:challenger.beast, isTraining:true});
    }

    if (msg.type==='accept') {
      const p1=lobby.get(msg.fromId), p2=lobby.get(id);
      if (!p1||!p2||p1.inBattle||p2.inBattle) return;
      
      if (msg.isTraining) {
        p1.inBattle=true; p2.inBattle=true;
        const bId=`btrain${uid()}`;
        battles.set(bId,{p1id:msg.fromId,p2id:id,st1:newState(),st2:newState(),turnId:msg.fromId,logs:[{t:`¡Entrenamiento amistoso! ${p1.name} vs ${p2.name}`,c:'hi'}],isTraining:true});
        send(p1.ws,{type:'battle_start',battleId:bId,role:'p1',opponent:p2.name,opponentBeast:p2.beast,isTraining:true});
        send(p2.ws,{type:'battle_start',battleId:bId,role:'p2',opponent:p1.name,opponentBeast:p1.beast,isTraining:true});
        await pushLobby();
        setTimeout(()=>pushBattle(bId),120);
      } else {
        if (!await hasHP(p1.wallet,100)||!await hasHP(p2.wallet,100)) {
          send(p1.ws,{type:'error',msg:'Fondos insuficientes para iniciar la batalla.'}); return;
        }
        await lockHP(p1.wallet,100); await lockHP(p2.wallet,100);
        p1.inBattle=true; p2.inBattle=true;
        const bId=`b${uid()}`;
        battles.set(bId,{p1id:msg.fromId,p2id:id,st1:newState(),st2:newState(),turnId:msg.fromId,logs:[],isCpu:false});
        battles.get(bId).logs.push({t:`¡Combate! ${p1.name} vs ${p2.name}`,c:'hi'});
        send(p1.ws,{type:'battle_start',battleId:bId,role:'p1',opponent:p2.name,opponentBeast:p2.beast});
        send(p2.ws,{type:'battle_start',battleId:bId,role:'p2',opponent:p1.name,opponentBeast:p1.beast});
        await pushLobby();
        setTimeout(()=>pushBattle(bId),120);
      }
    }

    if (msg.type==='attack') {
      const b=battles.get(msg.battleId); if (!b) return;
      if (b.isCpu) await processCpuPlayerTurn(msg.battleId, id, msg.index);
      else await processTurn(msg.battleId, id, msg.index);
    }

    if (msg.type==='challenge_cpu') {
      const pl=lobby.get(id);
      if (!pl||pl.inBattle) return;
      pl.inBattle=true;
      const cpuBeast=BEAST_KEYS[Math.floor(Math.random()*BEAST_KEYS.length)];
      const bId=`bcpu${uid()}`;
      battles.set(bId,{p1id:CPU_ID,p2id:id,st1:newState(),st2:newState(),turnId:CPU_ID,logs:[{t:`¡Zodiac Master invoca ${cpuBeast}! ¡Entrenamiento gratuito!`,c:'hi'}],isCpu:true,cpuIsP1:true,cpuBeast});
      send(ws,{type:'battle_start',battleId:bId,role:'p2',opponent:CPU_NAME,opponentBeast:cpuBeast,isCpu:true});
      await pushLobby();
      setTimeout(()=>{ pushCpuBattle(bId); scheduleCpuTurn(bId); },200);
    }

    if (msg.type==='cashout') {
      const pl=lobby.get(id);
      if (!pl||pl.inBattle) { send(ws,{type:'cashout_result',ok:false,reason:'En batalla o no conectado'}); return; }
      const currentHp = await getHP(pl.wallet);
      if (currentHp <= 0) { send(ws,{type:'cashout_result',ok:false,reason:'No tienes HP para retirar'}); return; }
      const usdcNeeded = parseFloat((currentHp * 0.001).toFixed(6));
      getPlatformUSDCBalance().then(async balance => {
        if (balance < usdcNeeded) {
          send(ws,{type:'cashout_result',ok:false, reason:`Fondos insuficientes en plataforma.`}); return;
        }
        const result = await cashout(pl.wallet);
        if (!result.ok) { send(ws,{type:'cashout_result',ok:false,reason:'Error al procesar'}); return; }
        send(ws,{type:'cashout_result',ok:true,hp:result.hp,usdc:result.usdc,status:'processing'});
        sendUSDC(pl.wallet, result.usdc)
          .then(sig => send(ws,{type:'cashout_result',ok:true,hp:result.hp,usdc:result.usdc,status:'confirmed',tx:sig}))
          .catch(async e => {
            await addHP(pl.wallet, result.hp);
            send(ws,{type:'cashout_result',ok:false,reason:'Error al enviar USDC: '+e.message});
          });
      }).catch(e => send(ws,{type:'cashout_result',ok:false,reason:'No se pudo verificar balance'}));
    }

    if (msg.type==='ping') {
      const p=lobby.get(id);
      if(p) {
        const hp=await getHP(p.wallet||'');
        send(ws,{type:'hp_updated',hp});
        await pushLobby();
      }
    }

    if (msg.type==='leave_lobby') {
      const p=lobby.get(id);
      if (p&&!p.inBattle){lobby.delete(id);await pushLobby();}
    }
  });

  ws.on('close', async ()=>{
    const p=lobby.get(id); if (!p) return;
    for (const [bId, b] of battles) {
      if (b.isTraining && (b.p1id===id||b.p2id===id)) { 
        battles.delete(bId); 
      } else if (b.isCpu && b.p2id===id) { 
        battles.delete(bId); 
      } else if (b.p1id===id||b.p2id===id) {
        const otherId=b.p1id===id?b.p2id:b.p1id;
        endBattle(bId,otherId,id,100,true);
      }
    }
    lobby.delete(id);
    await pushLobby();
  });
});

setTimeout(() => {
  try {
    require('./payment-monitor');
  } catch(e) {
    console.error('[ERROR] No se pudo iniciar el monitor de pagos:', e.message);
  }
}, 5000);

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`Zodiac Battle corriendo en http://localhost:${PORT}`));
