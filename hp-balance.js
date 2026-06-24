const { Pool } = require('pg');

// Conectar a la base de datos de Render usando la variable de entorno
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Crear tablas si no existen al arrancar
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

const USDC_PER_HP = 0.001;

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
};
