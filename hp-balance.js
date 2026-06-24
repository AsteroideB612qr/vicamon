// ── HP Balance Manager v2 ─────────────────────────────────────────────────────
const fs   = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'hp-balances.json');

const PLATFORM_WALLET = 'Gx9g45pNsENwczo197GTFgJrh6BN3pEZKqiEAfPZ453m';
const PLATFORM_THRESHOLD = 1.00; // auto-transfer at 1 USDC
const USDC_PER_HP = 0.001; // 1 HP = 0.001 USDC

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    // Migrate old format { "wallet": hp } to new { players, platformHp, inMatch }
    if (!raw.players) {
      const players = {};
      Object.entries(raw).forEach(([k, v]) => {
        if (typeof v === 'number') players[k] = v;
      });
      const migrated = { players, platformHp: 0, inMatch: {} };
      fs.writeFileSync(FILE, JSON.stringify(migrated, null, 2));
      return migrated;
    }
    return raw;
  } catch {
    return { players: {}, platformHp: 0, inMatch: {} };
  }
}

function save(d) { fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); }

// ── Player HP ─────────────────────────────────────────────────────────────────
function getHP(wallet)      { return load().players[wallet] || 0; }
function getLockedHP(wallet){ return load().inMatch[wallet] || 0; }

function addHP(wallet, hp) {
  const d = load();
  d.players[wallet] = (d.players[wallet] || 0) + hp;
  save(d);
  return d.players[wallet];
}

function hasHP(wallet, amount = 100) { return getHP(wallet) >= amount; }

// Lock HP at match start — returns false if insufficient
function lockHP(wallet, amount = 100) {
  const d = load();
  if ((d.players[wallet] || 0) < amount) return false;
  d.players[wallet]  -= amount;
  d.inMatch[wallet]   = (d.inMatch[wallet] || 0) + amount;
  save(d);
  return true;
}

// Release locked HP back (forfeit / cancel)
function unlockHP(wallet, amount = 100) {
  const d = load();
  d.players[wallet]  = (d.players[wallet] || 0) + amount;
  d.inMatch[wallet]  = Math.max(0, (d.inMatch[wallet] || 0) - amount);
  save(d);
}

// Settle a match result
// winner gets back their 100 locked HP + winnerHp from loser pool
// platform gets (100 - winnerHp) from loser pool
// loser gets 0
function settleMatch(winnerWallet, loserWallet, winnerHp) {
  const d = load();
  const hp = Math.max(0, Math.min(100, winnerHp));

  // Release winner's locked HP + grant them the HP they won from loser
  d.inMatch[winnerWallet] = Math.max(0, (d.inMatch[winnerWallet] || 0) - 100);
  d.players[winnerWallet] = (d.players[winnerWallet] || 0) + 100 + hp;

  // Release loser's locked HP to platform
  d.inMatch[loserWallet]  = Math.max(0, (d.inMatch[loserWallet] || 0) - 100);
  d.platformHp            = (d.platformHp || 0) + (100 - hp);

  save(d);
  return {
    winnerNewHp:  d.players[winnerWallet],
    platformHp:   d.platformHp,
    platformUsdc: parseFloat((d.platformHp * USDC_PER_HP).toFixed(3)),
  };
}

// ── Cashout ───────────────────────────────────────────────────────────────────
function cashout(wallet) {
  const d  = load();
  const hp = d.players[wallet] || 0;
  if (hp <= 0) return { ok: false, reason: 'no_hp', hp: 0, usdc: 0 };
  d.players[wallet] = 0;
  save(d);
  const usdc = parseFloat((hp * USDC_PER_HP).toFixed(6));
  return { ok: true, hp, usdc };
}

// ── Platform earnings ─────────────────────────────────────────────────────────
function getPlatformHp()   { return load().platformHp || 0; }
function getPlatformUsdc() { return parseFloat(((load().platformHp || 0) * USDC_PER_HP).toFixed(6)); }

function clearPlatformHp(hp) {
  const d = load();
  d.platformHp = Math.max(0, (d.platformHp || 0) - hp);
  save(d);
}

module.exports = {
  getHP, getLockedHP, addHP, hasHP,
  lockHP, unlockHP, settleMatch, cashout,
  getPlatformHp, getPlatformUsdc, clearPlatformHp,
  PLATFORM_WALLET, PLATFORM_THRESHOLD, USDC_PER_HP,
};
