const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Crear tablas y columnas si no existen
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

// NUEVO: Agregar columnas de estadísticas si no existen (para bases de datos ya creadas)
pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS wins INTEGER DEFAULT 0;`).catch(e=>{});
pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS losses INTEGER DEFAULT 0;`).catch(e=>{});
pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS last_name VARCHAR(20);`).catch(e=>{});

const USDC_PER_HP = 0.001;

// NUEVO: Guardar el nickname cuando el jugador entra al lobby
async function updatePlayerName(wallet, name) {
  await pool.query(`
    INSERT INTO players (wallet, last_name) VALUES ($1, $2)
    ON CONFLICT (wallet) DO UPDATE SET last_name = $2
  `, [wallet, name]);
}

// NUEVO: Sumar victorias y derrotas
async function updatePlayerStats(winnerWallet, loserWallet) {
  await pool.query('UPDATE players SET wins = wins + 1 WHERE wallet = $1', [winnerWallet]);
  await pool.query('UPDATE players SET losses = losses + 1 WHERE wallet = $1', [loserWallet]);
}

// NUEVO: Obtener el Top 3 jugadores
async function getTopPlayers(limit = 3) {
  const res = await pool.query('SELECT last_name, wins, losses FROM players WHERE wins > 0 ORDER BY wins DESC, losses ASC LIMIT $1', [limit]);
  return res.rows;
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
  updatePlayerName, updatePlayerStats, getTopPlayers // NUEVO
};
