const { Connection, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');

// ── Config Mainnet ─────────────────────────────────────────────────────────
const PLATFORM_WALLET = 'C7pezdMQV5SnXWuzpt9YHnW1JrAAjvjdybNqoE8uZFTb';
const USDC_MINT       = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC mainnet
const USDC_DECIMALS   = 6;
const MIN_AMOUNT      = 100_000; // mínimo 0.10 USDC = 100,000 micro-USDC
const CHECK_INTERVAL  = 15_000;  // cada 15 segundos (reduce rate limiting)
const GAME_SERVER_URL = 'http://localhost:3000/payment';

// RPCs gratuitos y confiables — en orden de prioridad
const RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-mainnet.rpc.extrnode.com',
  'https://go.getblock.io/solana-mainnet',
  'https://solana.public-rpc.com',
];
let rpcIndex = 0;

function getConnection() {
  return new Connection(RPC_ENDPOINTS[rpcIndex % RPC_ENDPOINTS.length], 'confirmed');
}

function rotateRpc() {
  rpcIndex = (rpcIndex + 1) % RPC_ENDPOINTS.length;
  console.log(`[RPC] Cambiando a: ${RPC_ENDPOINTS[rpcIndex]}`);
}

const connection = getConnection();

let lastSignature = null;
let processedSigs = new Set();

async function getPlatformTokenAccount() {
  const mint     = new PublicKey(USDC_MINT);
  const platform = new PublicKey(PLATFORM_WALLET);
  return getAssociatedTokenAddress(mint, platform);
}

async function getConnWithRetry() {
  for (let i = 0; i < RPC_ENDPOINTS.length; i++) {
    try {
      return new Connection(RPC_ENDPOINTS[(rpcIndex + i) % RPC_ENDPOINTS.length], 'confirmed');
    } catch { continue; }
  }
  return connection;
}

async function checkPayments() {
  try {
    const conn = getConnection();
    const tokenAccount = await getPlatformTokenAccount();

    const signatures = await conn.getSignaturesForAddress(tokenAccount, {
      limit: 10,
      ...(lastSignature ? { until: lastSignature } : {}),
    });

    if (!signatures.length) return;

    const toProcess = signatures.reverse();

    for (const sigInfo of toProcess) {
      if (sigInfo.err) continue;
      if (processedSigs.has(sigInfo.signature)) continue;

      const tx = await conn.getParsedTransaction(sigInfo.signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) continue;

      const instructions = tx.transaction.message.instructions;
      for (const ix of instructions) {
        if (ix.program !== 'spl-token') continue;
        if (ix.parsed?.type !== 'transferChecked' && ix.parsed?.type !== 'transfer') continue;

        const info   = ix.parsed?.info;
        if (!info) continue;

        const amount = parseInt(info.tokenAmount?.amount || info.amount || '0');
        if (amount < MIN_AMOUNT) continue; // ignorar pagos menores al mínimo

        const platformTA = (await getPlatformTokenAccount()).toBase58();
        const dest       = info.destination || '';
        const destOwner  = info.destinationOwner || '';
        if (dest !== platformTA && destOwner !== PLATFORM_WALLET) continue;

        // Extraer memo (nickname del jugador)
        const memoIx = tx.transaction.message.instructions.find(i =>
          i.program === 'spl-memo' ||
          i.programId?.toString() === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
        );
        const memo   = memoIx?.parsed || memoIx?.data || '';
        // Extraer dirección del remitente — puede venir en distintos campos según el tipo de tx
        const accountKeys = tx.transaction.message.accountKeys || [];
        const sender =
          info.owner ||
          info.authority ||
          info.multisigOwner ||
          accountKeys.find(k => {
            const addr = k?.pubkey?.toString() || k?.toString();
            return addr && addr !== PLATFORM_WALLET && addr.length > 30;
          })?.pubkey?.toString() ||
          accountKeys[0]?.pubkey?.toString() ||
          'unknown';

        console.log(`[PAGO ✓] 0.10 USDC de ${sender.slice(0,8)}... | memo: "${memo}" | tx: ${sigInfo.signature.slice(0,20)}...`);

        processedSigs.add(sigInfo.signature);

        try {
          const res = await fetch(GAME_SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              wallet:    sender,
              amount,
              signature: sigInfo.signature,
              memo,
            }),
          });
          const data = await res.json();
          console.log(`[HP ✓] Asignado a ${data.wallet?.slice(0,8)}...: ${data.hp} HP`);
        } catch (e) {
          console.error(`[ERROR] No se pudo notificar al servidor:`, e.message);
        }
      }

      lastSignature = sigInfo.signature;
    }
  } catch (e) {
    const msg = e.message || '';
    if (msg.includes('429') || msg.includes('403') || msg.includes('long-term storage') || msg.includes('Failed to fetch')) {
      rotateRpc();
    } else if (!msg.includes('429')) {
      console.error(`[ERROR] Monitor:`, msg.slice(0, 100));
    }
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
    const sigs = await getConnection().getSignaturesForAddress(tokenAccount, { limit: 1 });
    if (sigs.length) {
      lastSignature = sigs[0].signature;
      processedSigs.add(lastSignature);
      console.log(`  Historial previo ignorado.`);
    }
  } catch {
    console.log(`  Wallet sin historial aún — esperando primer pago.`);
  }

  console.log('\nEscuchando pagos...\n');
  setInterval(checkPayments, CHECK_INTERVAL);
}

start();
