const { Connection, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
const { PLATFORM_WALLET } = require('./hp-balance'); // UNIFICACIÓN: Leemos la wallet de la base de datos

const USDC_MINT       = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_DECIMALS   = 6;
const MIN_AMOUNT      = 100_000;
const CHECK_INTERVAL  = 30000; // 30 segundos
const GAME_SERVER_URL = 'http://localhost:' + (process.env.PORT || 3000) + '/payment';

const RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-mainnet.rpc.extrnode.com',
  'https://go.getblock.io/solana-mainnet',
  'https://solana.public-rpc.com',
];
let rpcIndex = 0;

function getConnection() { return new Connection(RPC_ENDPOINTS[rpcIndex % RPC_ENDPOINTS.length], 'confirmed'); }
function rotateRpc() { rpcIndex = (rpcIndex + 1) % RPC_ENDPOINTS.length; console.log(`[RPC] Cambiando a: ${RPC_ENDPOINTS[rpcIndex]}`); }
const connection = getConnection();

let processedSigs = new Set();
let isChecking = false;

async function getPlatformTokenAccount() {
  const mint = new PublicKey(USDC_MINT);
  const platform = new PublicKey(PLATFORM_WALLET);
  return getAssociatedTokenAddress(mint, platform);
}

async function checkPayments() {
  if (isChecking) return;
  isChecking = true;
  try {
    const conn = getConnection();
    const tokenAccount = await getPlatformTokenAccount();
    const signatures = await conn.getSignaturesForAddress(tokenAccount, { limit: 10 });

    if (!signatures.length) return;

    const toProcess = signatures.reverse();

    for (const sigInfo of toProcess) {
      if (sigInfo.err) continue;
      if (processedSigs.has(sigInfo.signature)) continue;

      const tx = await conn.getParsedTransaction(sigInfo.signature, { maxSupportedTransactionVersion: 0 });
      if (!tx) continue;

      const instructions = tx.transaction.message.instructions;
      for (const ix of instructions) {
        if (ix.program !== 'spl-token') continue;
        if (ix.parsed?.type !== 'transferChecked' && ix.parsed?.type !== 'transfer') continue;

        const info = ix.parsed?.info;
        if (!info) continue;

        const amount = parseInt(info.tokenAmount?.amount || info.amount || '0');
        if (amount < MIN_AMOUNT) continue;

        const platformTA = (await getPlatformTokenAccount()).toBase58();
        const dest = info.destination || '';
        const destOwner = info.destinationOwner || '';
        if (dest !== platformTA && destOwner !== PLATFORM_WALLET) continue;

        const memoIx = tx.transaction.message.instructions.find(i => i.program === 'spl-memo' || i.programId?.toString() === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
        const memo = memoIx?.parsed || memoIx?.data || '';
        
        const accountKeys = tx.transaction.message.accountKeys || [];
        const sender = info.owner || info.authority || info.multisigOwner || accountKeys.find(k => { const addr = k?.pubkey?.toString() || k?.toString(); return addr && addr !== PLATFORM_WALLET && addr.length > 30; })?.pubkey?.toString() || accountKeys[0]?.pubkey?.toString() || 'unknown';

        console.log(`[PAGO ✓] 0.10 USDC de ${sender.slice(0,8)}... | memo: "${memo}" | tx: ${sigInfo.signature.slice(0,20)}...`);

        processedSigs.add(sigInfo.signature);

        try {
          const res = await fetch(GAME_SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': process.env.INTERNAL_SECRET || 'dev-secret' },
            body: JSON.stringify({ wallet: sender, amount, signature: sigInfo.signature, memo }),
          });
          const data = await res.json();
          console.log(`[HP ✓] Asignado a ${data.wallet?.slice(0,8)}...: ${data.hp} HP`);
        } catch (e) {
          console.error(`[ERROR] No se pudo notificar al servidor:`, e.message);
        }
      }
    }
  } catch (e) {
    const msg = e.message || '';
    if (msg.includes('429') || msg.includes('403') || msg.includes('long-term storage') || msg.includes('Failed to fetch')) { rotateRpc(); } 
    else if (!msg.includes('429')) { console.error(`[ERROR] Monitor:`, msg.slice(0, 100)); }
  } finally {
    isChecking = false;
  }
}

async function start() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Zodiac Battle — Monitor de pagos USDC');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Red:      Mainnet`);
  console.log(`  Wallet:   ${PLATFORM_WALLET}`);
  console.log(`  Monto:    0.10 USDC por recarga (100 HP)`);
  console.log(`  Intervalo: cada ${CHECK_INTERVAL/1000}s`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    const tokenAccount = await getPlatformTokenAccount();
    console.log(`  Token Account: ${tokenAccount.toBase58()}`);
    const sigs = await getConnection().getSignaturesForAddress(tokenAccount, { limit: 10 });
    if (sigs.length) {
      sigs.forEach(s => processedSigs.add(s.signature));
      console.log(`  Ignoradas ${sigs.length} transacciones previas al arranque.`);
    }
  } catch { console.log(`  Wallet sin historial aún — esperando primer pago.`); }

  console.log('\nEscuchando pagos...\n');
  setInterval(checkPayments, CHECK_INTERVAL);
}

start();
