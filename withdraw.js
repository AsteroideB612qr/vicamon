// ── Retiro de fondos a wallet personal ───────────────────────────────────────
// Uso: node withdraw.js TU_WALLET_PERSONAL
// Ejemplo: node withdraw.js EhKUFA5TwoL9uuRo8W95NxJ2ErafTCzpuH7TTw6tqdZ7

const { sendUSDC } = require('./transfer');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');
const fs   = require('fs');
const path = require('path');

const USDC_MINT  = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const DECIMALS   = 6;
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

async function main() {
  const targetWallet = process.argv[2];
  if (!targetWallet) {
    console.error('Uso: node withdraw.js TU_WALLET_PERSONAL');
    console.error('Ejemplo: node withdraw.js EhKUFA5TwoL9uuRo8W95NxJ2ErafTCzpuH7TTw6tqdZ7');
    process.exit(1);
  }

  const raw      = JSON.parse(fs.readFileSync(path.join(__dirname, 'platform-wallet.json'), 'utf8'));
  const platform = Keypair.fromSecretKey(Uint8Array.from(raw));
  const ata      = await getAssociatedTokenAddress(USDC_MINT, platform.publicKey);

  let balance = 0;
  try {
    const account = await getAccount(connection, ata);
    balance = Number(account.amount) / Math.pow(10, DECIMALS);
  } catch {
    console.log('La wallet de la plataforma no tiene USDC aún.');
    process.exit(0);
  }

  if (balance <= 0) {
    console.log('Balance de la plataforma: 0 USDC. Nada que retirar.');
    process.exit(0);
  }

  console.log(`Balance plataforma: ${balance} USDC`);
  console.log(`Enviando ${balance} USDC a ${targetWallet}...`);

  const sig = await sendUSDC(targetWallet, balance);
  console.log(`\n✓ Retiro completado: ${balance} USDC enviados.`);
  console.log(`  TX: https://solscan.io/tx/${sig}`);
}

main().catch(console.error);
