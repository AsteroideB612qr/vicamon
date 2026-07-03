const {
  Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction
} = require('@solana/web3.js');
const {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAccount,
} = require('@solana/spl-token');
const fs   = require('fs');
const path = require('path');

const USDC_MINT  = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // mainnet
const DECIMALS   = 6;
const RPCS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-mainnet.rpc.extrnode.com',
  'https://solana.public-rpc.com',
];

async function getWorkingConnection() {
  for (const rpc of RPCS) {
    try {
      const conn = new Connection(rpc, 'confirmed');
      await conn.getLatestBlockhash(); // test connection
      return conn;
    } catch { continue; }
  }
  return new Connection(RPCS[0], 'confirmed');
}

// CORRECCIÓN: Función async para poder importar bs58 de forma dinámica
async function loadPlatformWallet() {
  // 1. Si estamos en la nube (Render), usar la variable de entorno secreta
  const secretEnv = process.env.PLATFORM_WALLET_SECRET;
  if (secretEnv) {
    try {
      // Si es un arreglo (formato antiguo)
      if (secretEnv.startsWith('[')) {
        const secret = JSON.parse(secretEnv);
        return Keypair.fromSecretKey(Uint8Array.from(secret));
      }
      // Si es texto (formato nuevo Base58 de Phantom)
      // Importamos bs58 dinámicamente porque la versión 6 es ESM y da error con require()
      const bs58 = (await import('bs58')).default;
      const secretKey = bs58.decode(secretEnv);
      return Keypair.fromSecretKey(secretKey);
    } catch(e) {
      console.error("Error leyendo la wallet desde variables de entorno:", e.message);
      throw e;
    }
  }
  // 2. Si estamos en tu PC local, usar el archivo de siempre
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'platform-wallet.json'), 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function sendUSDC(toWalletAddress, amountUSDC) {
  const platform    = await loadPlatformWallet(); // Ahora esperamos a que cargue
  const toPublicKey = new PublicKey(toWalletAddress);
  const amount      = Math.round(amountUSDC * Math.pow(10, DECIMALS));
  const conn        = await getWorkingConnection();

  const fromATA = await getAssociatedTokenAddress(USDC_MINT, platform.publicKey);
  const toATA   = await getAssociatedTokenAddress(USDC_MINT, toPublicKey);

  const tx = new Transaction();

  try { await getAccount(conn, toATA); }
  catch {
    tx.add(createAssociatedTokenAccountInstruction(
      platform.publicKey, toATA, toPublicKey, USDC_MINT
    ));
  }

  tx.add(createTransferCheckedInstruction(
    fromATA, USDC_MINT, toATA, platform.publicKey, amount, DECIMALS
  ));

  const signature = await sendAndConfirmTransaction(conn, tx, [platform]);
  console.log(`[TRANSFER ✓] ${amountUSDC} USDC → ${toWalletAddress.slice(0,8)}... | tx: ${signature.slice(0,20)}...`);
  return signature;
}

module.exports = { sendUSDC };
