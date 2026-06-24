// Uso: node reset-hp.js WALLET
// Ejemplo: node reset-hp.js EhKUFA5TwoL9uuRo8W95NxJ2ErafTCzpuH7TTw6tqdZ7
// Sin argumentos: muestra todos los balances actuales

const fs   = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'hp-balances.json');

function load() { try { return JSON.parse(fs.readFileSync(FILE,'utf8')); } catch { return {}; } }
function save(d) { fs.writeFileSync(FILE, JSON.stringify(d,null,2)); }

const wallet = process.argv[2];
const data   = load();

if (!wallet) {
  console.log('── HP Balances actuales ──────────────────');
  if (!Object.keys(data).length) { console.log('  (vacío)'); }
  else Object.entries(data).forEach(([w,hp]) => console.log(`  ${w.slice(0,8)}...${w.slice(-6)}: ${hp} HP`));
  console.log('──────────────────────────────────────────');
  console.log('Para resetear: node reset-hp.js WALLET');
  console.log('Para resetear todo: node reset-hp.js ALL');
  process.exit(0);
}

if (wallet === 'ALL') {
  save({});
  console.log('✓ Todos los balances reseteados a 0 HP');
} else {
  const before = data[wallet] || 0;
  data[wallet] = 0;
  save(data);
  console.log(`✓ ${wallet.slice(0,8)}...${wallet.slice(-6)}: ${before} HP → 0 HP`);
}
