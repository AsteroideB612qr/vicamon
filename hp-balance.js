const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

pool.query(`CREATE TABLE IF NOT EXISTS players (wallet VARCHAR(50) PRIMARY KEY, hp INTEGER DEFAULT 0, locked_hp INTEGER DEFAULT 0);`).catch(e => console.error("Error creando tabla players:", e));
pool.query(`CREATE TABLE IF NOT EXISTS platform (id INTEGER PRIMARY KEY DEFAULT 1, hp INTEGER DEFAULT 0);`).catch(e => console.error("Error creando tabla platform:", e));
pool.query(`CREATE TABLE IF NOT EXISTS processed_txs (signature VARCHAR(100) PRIMARY KEY);`).catch(e=>{});
pool.query(`INSERT INTO platform (id, hp) VALUES (1, 0) ON CONFLICT DO NOTHING;`).catch(e=>{});
pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS wins INTEGER DEFAULT 0;`).catch(e=>{});
pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS losses INTEGER DEFAULT 0;`).catch(e=>{});
pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS last_name VARCHAR(20);`).catch(e=>{});
pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS tower_train_date VARCHAR(10);`).catch(e=>{});
pool.query(`CREATE TABLE IF NOT EXISTS attacks (id VARCHAR(50) PRIMARY KEY, name VARCHAR(50), d INT, acc INT, fx VARCHAR(50), pp INT, description TEXT, type VARCHAR(20), cost INT);`).catch(e => console.error("Error creando tabla attacks:", e));
pool.query(`CREATE TABLE IF NOT EXISTS vicamons (id VARCHAR(50) PRIMARY KEY, name VARCHAR(50), sub VARCHAR(50), img VARCHAR(100), el VARCHAR(20), style VARCHAR(20), cat VARCHAR(20), stats JSONB, attacks JSONB);`).catch(e => console.error("Error creando tabla vicamons:", e));

const USDC_PER_HP = 0.001;
const PLATFORM_WALLET = process.env.PLATFORM_WALLET || 'U3jwNBDnw4kCQ5CYRp5mAf4hbr4dadyUGXDhXdyLXMv';

let cachedExcedente = 0;
async function updateCachedExcedente() {
  try {
    const platformHp = await getPlatformHp();
    const playersHp = await getTotalPlayersHP();
    cachedExcedente = platformHp - playersHp;
  } catch(e) { console.error("Error actualizando excedente caché:", e); }
}
setInterval(updateCachedExcedente, 10000);
updateCachedExcedente(); 

async function getAllPlayersDebug() { const res = await pool.query('SELECT wallet, hp, locked_hp, wins, losses, last_name FROM players'); return res.rows; }
async function isTxProcessed(signature) { const res = await pool.query('SELECT 1 FROM processed_txs WHERE signature = $1', [signature]); return res.rows.length > 0; }
async function markTxProcessed(signature) { await pool.query('INSERT INTO processed_txs (signature) VALUES ($1) ON CONFLICT DO NOTHING', [signature]); }
async function adminSetHP(wallet, hp) { await pool.query(`INSERT INTO players (wallet, hp) VALUES ($1, $2) ON CONFLICT (wallet) DO UPDATE SET hp = $2`, [wallet, hp]); return await getHP(wallet); }
async function adminResetPlatform() { await pool.query('UPDATE platform SET hp = 0 WHERE id = 1'); }
async function adminUnlockAllHP() { await pool.query('UPDATE players SET hp = hp + locked_hp, locked_hp = 0'); }
async function updatePlayerName(wallet, name) { await pool.query(`INSERT INTO players (wallet, last_name) VALUES ($1, $2) ON CONFLICT (wallet) DO UPDATE SET last_name = $2`, [wallet, name]); }
async function updatePlayerStats(winnerWallet, loserWallet) { await pool.query('UPDATE players SET wins = wins + 1 WHERE wallet = $1', [winnerWallet]); await pool.query('UPDATE players SET losses = losses + 1 WHERE wallet = $1', [loserWallet]); }
async function getTopPlayers(limit = 3) { const res = await pool.query('SELECT last_name, wins, losses FROM players WHERE wins > 0 ORDER BY wins DESC, losses ASC LIMIT $1', [limit]); return res.rows; }

// NUEVO: getLeaderboard ahora calcula el Tier y el Rank de cada jugador en la lista
async function getLeaderboard(limit = 100) {
    const tRes = await pool.query('SELECT COUNT(*) as total FROM players WHERE wins > 0 OR losses > 0');
    const totalRanked = parseInt(tRes.rows[0].total, 10);
    if (totalRanked === 0) return [];
    
    const res = await pool.query('SELECT last_name, wins, losses FROM players WHERE wins > 0 OR losses > 0 ORDER BY wins DESC, losses ASC LIMIT $1', [limit]);
    
    return res.rows.map((p, index) => {
        const rank = index + 1;
        let tier = 5; 
        if (totalRanked > 0) {
            const percentile = (rank / totalRanked) * 100;
            if (percentile <= 5) tier = 1;
            else if (percentile <= 15) tier = 2;
            else if (percentile <= 30) tier = 3;
            else if (percentile <= 50) tier = 4;
            else tier = 5;
        }
        return { ...p, rank, tier };
    });
}

async function getPlayerStats(wallet) {
  const res = await pool.query('SELECT wins, losses FROM players WHERE wallet = $1', [wallet]);
  if (res.rows.length === 0) return { wins: 0, losses: 0, rank: null, tier: 0, totalRanked: 0 };
  
  const { wins, losses } = res.rows[0];
  let rank = null;
  let tier = 0; 
  let totalRanked = 0;

  if (wins > 0 || losses > 0) {
    const rRes = await pool.query('SELECT COUNT(*) + 1 as rank FROM players WHERE wins > $1 OR (wins = $1 AND losses < $2)', [wins, losses]);
    const tRes = await pool.query('SELECT COUNT(*) as total FROM players WHERE wins > 0 OR losses > 0');
    rank = parseInt(rRes.rows[0].rank, 10);
    totalRanked = parseInt(tRes.rows[0].total, 10);
    
    if (totalRanked > 0) {
      const percentile = (rank / totalRanked) * 100;
      if (percentile <= 5) tier = 1;
      else if (percentile <= 15) tier = 2;
      else if (percentile <= 30) tier = 3;
      else if (percentile <= 50) tier = 4;
      else tier = 5;
    } else {
      tier = 5;
    }
  } else {
    tier = 0;
  }
  
  return { wins, losses, rank, tier, totalRanked };
}

async function getPlayerRank(wallet) { 
  const stats = await getPlayerStats(wallet);
  return stats.rank;
}

async function getHP(wallet) { const res = await pool.query('SELECT hp FROM players WHERE wallet = $1', [wallet]); return res.rows.length > 0 ? res.rows[0].hp : 0; }
async function addHP(wallet, hp) { await pool.query(`INSERT INTO players (wallet, hp, locked_hp) VALUES ($1, $2, 0) ON CONFLICT (wallet) DO UPDATE SET hp = players.hp + $2`, [wallet, hp]); return await getHP(wallet); }
async function hasHP(wallet, amount = 100) { return (await getHP(wallet)) >= amount; }
async function lockHP(wallet, amount = 100) { const client = await pool.connect(); try { await client.query('BEGIN'); const res = await client.query('SELECT hp FROM players WHERE wallet = $1 FOR UPDATE', [wallet]); const currentHp = res.rows.length > 0 ? res.rows[0].hp : 0; if (currentHp < amount) { await client.query('ROLLBACK'); return false; } await client.query('UPDATE players SET hp = hp - $1, locked_hp = locked_hp + $1 WHERE wallet = $2', [amount, wallet]); await client.query('COMMIT'); return true; } catch(e) { await client.query('ROLLBACK'); return false; } finally { client.release(); } }
async function unlockHP(wallet, amount = 100) { await pool.query('UPDATE players SET hp = hp + $1, locked_hp = GREATEST(0, locked_hp - $1) WHERE wallet = $2', [amount, wallet]); }
async function settleMatch(winnerWallet, loserWallet, winnerHp) { const client = await pool.connect(); try { await client.query('BEGIN'); const hp = Math.max(0, Math.min(100, winnerHp)); await client.query('UPDATE players SET locked_hp = GREATEST(0, locked_hp - 100), hp = hp + 100 + $1 WHERE wallet = $2', [hp, winnerWallet]); await client.query('UPDATE players SET locked_hp = GREATEST(0, locked_hp - 100) WHERE wallet = $1', [loserWallet]); await client.query('UPDATE platform SET hp = hp + (100 - $1) WHERE id = 1', [hp]); await client.query('COMMIT'); const winnerNewHp = await getHP(winnerWallet); const platformHp = await getPlatformHp(); return { winnerNewHp, platformHp, platformUsdc: parseFloat((platformHp * USDC_PER_HP).toFixed(3)) }; } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); } }
async function settleTeamMatch(winnerWallet, loserWallet, winnerRemainingHp) { const client = await pool.connect(); try { await client.query('BEGIN'); const hp = Math.max(0, Math.min(300, winnerRemainingHp)); await client.query('UPDATE players SET locked_hp = GREATEST(0, locked_hp - 300), hp = hp + 300 + $1 WHERE wallet = $2', [hp, winnerWallet]); await client.query('UPDATE players SET locked_hp = GREATEST(0, locked_hp - 300) WHERE wallet = $1', [loserWallet]); await client.query('UPDATE platform SET hp = hp + (300 - $1) WHERE id = 1', [hp]); await client.query('COMMIT'); const winnerNewHp = await getHP(winnerWallet); return { winnerNewHp }; } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); } }

function calculateGauntletReward(defeatedCount) {
  if (defeatedCount <= 5) return 0;
  if (defeatedCount === 6) return 10;
  if (defeatedCount === 7) return 10;
  if (defeatedCount === 8) return 30;
  if (defeatedCount === 9) return 30;
  if (defeatedCount === 10) return 30;
  if (defeatedCount === 11) return 40;
  if (defeatedCount >= 12) return 200; 
  return 0;
}

async function settleGauntletTiered(wallet, defeatedCount) { 
  const client = await pool.connect(); 
  try { 
    await client.query('BEGIN'); 
    const reward = calculateGauntletReward(defeatedCount);
    const platformProfit = 100 - reward;
    await client.query('UPDATE players SET locked_hp = GREATEST(0, locked_hp - 100), hp = hp + $1 WHERE wallet = $2', [reward, wallet]); 
    if (platformProfit > 0) {
      await client.query('UPDATE platform SET hp = hp + $1 WHERE id = 1', [platformProfit]);
    } else if (platformProfit < 0) {
      await client.query('UPDATE platform SET hp = GREATEST(0, hp + $1) WHERE id = 1', [platformProfit]);
    }
    await client.query('COMMIT'); 
    const newHp = await getHP(wallet);
    return { newHp, reward }; 
  } catch(e) { 
    await client.query('ROLLBACK'); 
    throw e; 
  } finally { 
    client.release(); 
  } 
}

async function getTotalPlayersHP() {
  const res = await pool.query('SELECT COALESCE(SUM(hp), 0) as total_hp, COALESCE(SUM(locked_hp), 0) as total_locked FROM players');
  const totalHp = res.rows.length > 0 ? parseInt(res.rows[0].total_hp, 10) : 0;
  const totalLocked = res.rows.length > 0 ? parseInt(res.rows[0].total_locked, 10) : 0;
  return totalHp + totalLocked;
}

async function getExcedente() { return cachedExcedente; }
async function getTowerStatus() { const excedente = cachedExcedente; return { grandAvailable: excedente >= 2000, trainAvailable: excedente >= 10, excedente: excedente }; }

async function claimTowerGrandPrize(wallet) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const platRes = await client.query('SELECT hp FROM platform WHERE id = 1 FOR UPDATE');
    const playersRes = await client.query('SELECT COALESCE(SUM(hp), 0) as total_hp, COALESCE(SUM(locked_hp), 0) as total_locked FROM players');
    const playersHp = parseInt(playersRes.rows[0].total_hp, 10) + parseInt(playersRes.rows[0].total_locked, 10);
    const excedente = platRes.rows[0].hp - playersHp;
    if (excedente < 2000) { await client.query('ROLLBACK'); return false; } 
    await client.query('UPDATE players SET locked_hp = GREATEST(0, locked_hp - 100), hp = hp + 1000 WHERE wallet = $1', [wallet]);
    await client.query('UPDATE platform SET hp = hp - 900 WHERE id = 1');
    await client.query('COMMIT');
    updateCachedExcedente(); 
    return true;
  } catch(e) { await client.query('ROLLBACK'); return false; } finally { client.release(); }
}

async function checkTowerTrainingWin(wallet) {
  const res = await pool.query('SELECT tower_train_date FROM players WHERE wallet = $1', [wallet]);
  if (res.rows.length > 0) { const today = new Date().toISOString().split('T')[0]; return res.rows[0].tower_train_date === today; }
  return false;
}

async function claimTowerTrainingWin(wallet) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query('SELECT tower_train_date, hp FROM players WHERE wallet = $1 FOR UPDATE', [wallet]);
    if (res.rows.length === 0) { await client.query('ROLLBACK'); return false; }
    const today = new Date().toISOString().split('T')[0];
    if (res.rows[0].tower_train_date === today) { await client.query('ROLLBACK'); return false; }
    const platRes = await client.query('SELECT hp FROM platform WHERE id = 1 FOR UPDATE');
    const playersRes = await client.query('SELECT COALESCE(SUM(hp), 0) as total_hp, COALESCE(SUM(locked_hp), 0) as total_locked FROM players');
    const playersHp = parseInt(playersRes.rows[0].total_hp, 10) + parseInt(playersRes.rows[0].total_locked, 10);
    const excedente = platRes.rows[0].hp - playersHp;
    if (excedente < 10) { await client.query('ROLLBACK'); return false; }
    await client.query('UPDATE players SET hp = hp + 10, tower_train_date = $1 WHERE wallet = $2', [today, wallet]);
    await client.query('UPDATE platform SET hp = hp - 10 WHERE id = 1');
    await client.query('COMMIT');
    updateCachedExcedente(); 
    const newHp = res.rows[0].hp + 10;
    return { ok: true, newHp };
  } catch(e) { await client.query('ROLLBACK'); return false; } finally { client.release(); }
}

async function checkOwnerWithdrawal() { if (cachedExcedente >= 4000) { return { shouldWithdraw: true, amountUsdc: 1.0, hpToClear: 1000 }; } return { shouldWithdraw: false }; }
async function setPlatformHp(hp) { await pool.query('UPDATE platform SET hp = $1 WHERE id = 1', [hp]); updateCachedExcedente(); }
async function addPlatformHp(hp) { await pool.query('UPDATE platform SET hp = hp + $1 WHERE id = 1', [hp]); updateCachedExcedente(); }
async function cashout(wallet) { const client = await pool.connect(); try { await client.query('BEGIN'); const res = await client.query('SELECT hp FROM players WHERE wallet = $1 FOR UPDATE', [wallet]); const hp = res.rows.length > 0 ? res.rows[0].hp : 0; if (hp <= 0) { await client.query('ROLLBACK'); return { ok: false, reason: 'no_hp', hp: 0, usdc: 0 }; } await client.query('UPDATE players SET hp = 0 WHERE wallet = $1', [wallet]); await client.query('COMMIT'); updateCachedExcedente(); return { ok: true, hp, usdc: parseFloat((hp * USDC_PER_HP).toFixed(6)) }; } catch(e) { await client.query('ROLLBACK'); return { ok: false, reason: 'db_error', hp: 0, usdc: 0 }; } finally { client.release(); } }
async function getPlatformHp() { const res = await pool.query('SELECT hp FROM platform WHERE id = 1'); return res.rows.length > 0 ? res.rows[0].hp : 0; }
async function getPlatformUsdc() { return parseFloat(((await getPlatformHp()) * USDC_PER_HP).toFixed(6)); }
async function clearPlatformHp(hp) { await pool.query('UPDATE platform SET hp = GREATEST(0, hp - $1) WHERE id = 1', [hp]); updateCachedExcedente(); }
async function getAllAttacksDB() { const res = await pool.query('SELECT * FROM attacks'); return res.rows; }
async function getAllVicamonsDB() { const res = await pool.query('SELECT * FROM vicamons'); return res.rows; }
async function saveAttackDB(data) { await pool.query(`INSERT INTO attacks (id, name, d, acc, fx, pp, description, type, cost) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO UPDATE SET name=$2, d=$3, acc=$4, fx=$5, pp=$6, description=$7, type=$8, cost=$9`, [data.id, data.name, data.d, data.acc, data.fx, data.pp, data.desc, data.type, data.cost]); }
async function saveVicamonDB(data) { await pool.query(`INSERT INTO vicamons (id, name, sub, img, el, style, cat, stats, attacks) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO UPDATE SET name=$2, sub=$3, img=$4, el=$5, style=$6, cat=$7, stats=$8, attacks=$9`, [data.id, data.name, data.sub, data.img, data.el, data.style, data.cat, JSON.stringify(data.stats), JSON.stringify(data.attacks)]); }

module.exports = {
  getHP, addHP, hasHP, lockHP, unlockHP, settleMatch, settleTeamMatch, settleGauntletTiered, cashout,
  getPlatformHp, getPlatformUsdc, clearPlatformHp, setPlatformHp, addPlatformHp,
  PLATFORM_WALLET, PLATFORM_THRESHOLD: 1.00, USDC_PER_HP,
  getAllPlayersDebug, updatePlayerName, updatePlayerStats, getTopPlayers, getLeaderboard,
  getPlayerStats, getPlayerRank,
  isTxProcessed, markTxProcessed,
  adminSetHP, adminResetPlatform, adminUnlockAllHP,
  calculateGauntletReward,
  getTowerStatus, claimTowerGrandPrize, checkTowerTrainingWin, claimTowerTrainingWin,
  getExcedente, getTotalPlayersHP, checkOwnerWithdrawal,
  getAllAttacksDB, getAllVicamonsDB, saveAttackDB, saveVicamonDB
};
