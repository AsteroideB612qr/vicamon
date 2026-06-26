const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

pool.query(`
  CREATE TABLE IF NOT EXISTS players (
    wallet VARCHAR(50) PRIMARY KEY,
    hp INTEGER DEFAULT 0,
    locked_hp INTEGER DEFAULT 0
  );
`).catch(e => console.error("Error creando tabla players:", e));

pool.query(`
  CREATE TABLE IF NOT EXISTS platform (
    id INTEGER PRIMARY KEY DEFAULT 1,
    hp INTEGER DEFAULT 0
  );
`).catch(e => console.error("Error creando tabla platform:", e));

pool.query(`INSERT INTO platform (id, hp) VALUES (1, 0) ON CONFLICT DO NOTHING;`).catch(e=>{});

pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS wins INTEGER DEFAULT 0;`).catch(e=>{});
pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS losses INTEGER DEFAULT 0;`).catch(e=>{});
pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS last_name VARCHAR(20);`).catch(e=>{});

const USDC_PER_HP = 0.001;

async function getAllPlayersDebug() {
  const res = await pool.query('SELECT wallet, hp, locked_hp, wins, losses, last_name FROM players');
  return res.rows;
}

async function updatePlayerName(wallet, name) {
  await pool.query(`
    INSERT INTO players (wallet, last_name) VALUES ($1, $2)
    ON CONFLICT (wallet) DO UPDATE SET last_name = $2
  `, [wallet, name]);
}

async function updatePlayerStats(winnerWallet, loserWallet) {
  await pool.query('UPDATE players SET wins = wins + 1 WHERE wallet = $1', [winnerWallet]);
  await pool.query('UPDATE players SET losses = losses + 1 WHERE wallet = $1', [loserWallet]);
}

async function getTopPlayers(limit = 3) {
  const res = await pool.query('SELECT last_name, wins, losses FROM players WHERE wins > 0 ORDER BY wins DESC, losses ASC LIMIT $1', [limit]);
  return res.rows;
}

// NUEVO: Obtener victorias y derrotas de un jugador
async function getPlayerStats(wallet) {
  const res = await pool.query('SELECT wins, losses FROM players WHERE wallet = $1', [wallet]);
  if (res.rows.length > 0) return res.rows[0];
  return { wins: 0, losses: 0 };
}

// NUEVO: Calcular el puesto global del jugador
async function getPlayerRank(wallet) {
  const pRes = await pool.query('SELECT wins, losses FROM players WHERE wallet = $1', [wallet]);
  if (pRes.rows.length === 0 || pRes.rows[0].wins === 0) return null; // No rankeado si tiene 0 victorias
  const { wins, losses } = pRes.rows[0];
  const rRes = await pool.query('SELECT COUNT(*) + 1 as rank FROM players WHERE wins > $1 OR (wins = $1 AND losses < $2)', [wins, losses]);
  return parseInt(rRes.rows[0].rank, 10);
}

async function getHP(wallet) {
  const res = await pool.query('SELECT hp FROM players WHERE wallet = $1', [wallet]);
  return res.rows.length > 0 ? res.rows[0].hp : 0;
}

async function addHP(wallet, hp) {
  await pool.query(`
    INSERT INTO players (wallet, hp, locked_hp) VALUES ($1, $2, 0)
    ON CONFLICT (wallet) DO UPDATE SET hp = players.hp + $2
  `, [wallet, hp]);
  return await getHP(wallet);
}

async function hasHP(wallet, amount = 100) {
  return (await getHP(wallet)) >= amount;
}

async function lockHP(wallet, amount = 100) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query('SELECT hp FROM players WHERE wallet = $1 FOR UPDATE', [wallet]);
    const currentHp = res.rows.length > 0 ? res.rows[0].hp : 0;
    if (currentHp < amount) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query('UPDATE players SET hp = hp - $1, locked_hp = locked_hp + $1 WHERE wallet = $2', [amount, wallet]);
    await client.query('COMMIT');
    return true;
  } catch(e) {
    await client.query('ROLLBACK');
    return false;
  } finally {
    client.release();
  }
}

async function unlockHP(wallet, amount = 100) {
  await pool.query('UPDATE players SET hp = hp + $1, locked_hp = GREATEST(0, locked_hp - $1) WHERE wallet = $2', [amount, wallet]);
}

async function settleMatch(winnerWallet, loserWallet, winnerHp) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hp = Math.max(0, Math.min(100, winnerHp));
    
    await client.query('UPDATE players SET locked_hp = GREATEST(0, locked_hp - 100), hp = hp + 100 + $1 WHERE wallet = $2', [hp, winnerWallet]);
    await client.query('UPDATE players SET locked_hp = GREATEST(0, locked_hp - 100) WHERE wallet = $1', [loserWallet]);
    await client.query('UPDATE platform SET hp = hp + (100 - $1) WHERE id = 1', [hp]);
    
    await client.query('COMMIT');
    
    const winnerNewHp = await getHP(winnerWallet);
    const platformHp = await getPlatformHp();
    return {
      winnerNewHp,
      platformHp,
      platformUsdc: parseFloat((platformHp * USDC_PER_HP).toFixed(3))
    };
  } catch(e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function cashout(wallet) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query('SELECT hp FROM players WHERE wallet = $1 FOR UPDATE', [wallet]);
    const hp = res.rows.length > 0 ? res.rows[0].hp : 0;
    if (hp <= 0) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'no_hp', hp: 0, usdc: 0 };
    }
    await client.query('UPDATE players SET hp = 0 WHERE wallet = $1', [wallet]);
    await client.query('COMMIT');
    return { ok: true, hp, usdc: parseFloat((hp * USDC_PER_HP).toFixed(6)) };
  } catch(e) {
    await client.query('ROLLBACK');
    return { ok: false, reason: 'db_error', hp: 0, usdc: 0 };
  } finally {
    client.release();
  }
}

async function getPlatformHp() {
  const res = await pool.query('SELECT hp FROM platform WHERE id = 1');
  return res.rows.length > 0 ? res.rows[0].hp : 0;
}

async function getPlatformUsdc() {
  return parseFloat(((await getPlatformHp()) * USDC_PER_HP).toFixed(6));
}

async function clearPlatformHp(hp) {
  await pool.query('UPDATE platform SET hp = GREATEST(0, hp - $1) WHERE id = 1', [hp]);
}

module.exports = {
  getHP, addHP, hasHP,
  lockHP, unlockHP, settleMatch, cashout,
  getPlatformHp, getPlatformUsdc, clearPlatformHp,
  PLATFORM_WALLET: 'Gx9g45pNsENwczo197GTFgJrh6BN3pEZKqiEAfPZ453m', 
  PLATFORM_THRESHOLD: 1.00, 
  USDC_PER_HP,
  getAllPlayersDebug,
  updatePlayerName, updatePlayerStats, getTopPlayers,
  getPlayerStats, getPlayerRank // NUEVO
};
