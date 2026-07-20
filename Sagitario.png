// Uso: node reset-hp.js WALLET
// Ejemplo: node reset-hp.js EhKUFA5TwoL9uuRo8W95NxJ2ErafTCzpuH7TTw6tqdZ7
// Sin argumentos: muestra todos los balances actuales
// "ALL": resetea todos los balances a 0

const { Pool } = require('pg');

// Conectar a la base de datos usando la variable de entorno
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

const wallet = process.argv[2];

async function main() {
  if (!wallet) {
    try {
      const res = await pool.query('SELECT wallet, hp, locked_hp FROM players');
      console.log('── HP Balances actuales ──────────────────');
      if (res.rows.length === 0) {
        console.log('  (vacío)');
      } else {
        res.rows.forEach(row => {
          console.log(`  ${row.wallet.slice(0,8)}...${row.wallet.slice(-6)}: ${row.hp} HP (Bloqueados: ${row.locked_hp})`);
        });
      }
      console.log('──────────────────────────────────────────');
      console.log('Para resetear 1 jugador: node reset-hp.js WALLET');
      console.log('Para resetear todo: node reset-hp.js ALL');
    } catch(e) {
      console.error('Error leyendo la base de datos:', e.message);
    } finally {
      pool.end();
    }
    return;
  }

  if (wallet === 'ALL') {
    try {
      await pool.query('UPDATE players SET hp = 0, locked_hp = 0');
      await pool.query('UPDATE platform SET hp = 0 WHERE id = 1');
      console.log('✓ Todos los balances reseteados a 0 HP (Jugadores y Plataforma)');
    } catch(e) {
      console.error('Error reseteando todo:', e.message);
    } finally {
      pool.end();
    }
    return;
  }

  try {
    const res = await pool.query('UPDATE players SET hp = 0, locked_hp = 0 WHERE wallet = $1 RETURNING *', [wallet]);
    if (res.rows.length > 0) {
      console.log(`✓ ${wallet.slice(0,8)}...${wallet.slice(-6)}: 0 HP`);
    } else {
      console.log(`No se encontró la wallet ${wallet} en la base de datos.`);
    }
  } catch(e) {
    console.error('Error reseteando wallet:', e.message);
  } finally {
    pool.end();
  }
}

main();
