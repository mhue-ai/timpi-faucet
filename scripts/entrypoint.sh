#!/bin/sh
set -e

KEYSTORE_DIR="${KEYSTORE_PATH%/*}"
KEYSTORE_FILE="${KEYSTORE_PATH:-/app/data/keystore.enc}"

# Ensure data directory exists
mkdir -p /app/data

# Check if wallet needs initialization
if [ ! -f "$KEYSTORE_FILE" ]; then
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║              FIRST RUN - WALLET INITIALIZATION               ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
  
  if [ -z "$FAUCET_WALLET_PASSWORD" ]; then
    echo "ERROR: FAUCET_WALLET_PASSWORD is required for wallet initialization"
    exit 1
  fi
  
  echo "Initializing new faucet wallet..."
  
  # Use ClawPurse to init wallet
  node -e "
    const { initWallet } = require('clawpurse');
    (async () => {
      const result = await initWallet(process.env.FAUCET_WALLET_PASSWORD, {
        keystorePath: '$KEYSTORE_FILE'
      });
      console.log('');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('  FAUCET WALLET CREATED');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('');
      console.log('  Address: ' + result.address);
      console.log('');
      console.log('  ⚠️  SAVE YOUR MNEMONIC (shown once):');
      console.log('');
      console.log('  ' + result.mnemonic);
      console.log('');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('');
      console.log('  Next steps:');
      console.log('  1. Save the mnemonic securely');
      console.log('  2. Fund the address with NTMPI');
      console.log('  3. Restart the container');
      console.log('');
    })().catch(err => {
      console.error('Failed to initialize wallet:', err.message);
      process.exit(1);
    });
  "
  
  echo ""
  echo "Wallet initialized. Waiting for funding before starting..."
  echo "Container will check balance every 30 seconds."
  echo ""
  
  # Wait for funding
  while true; do
    BALANCE=$(node -e "
      const { getBalance, loadKeystore } = require('clawpurse');
      (async () => {
        try {
          const { address } = await loadKeystore(process.env.FAUCET_WALLET_PASSWORD, '$KEYSTORE_FILE');
          const bal = await getBalance(address);
          console.log(bal.primary.displayAmount);
        } catch (e) {
          console.log('0');
        }
      })();
    " 2>/dev/null || echo "0")
    
    if [ "$(echo "$BALANCE > 1" | bc -l 2>/dev/null || echo 0)" = "1" ]; then
      echo "Balance detected: $BALANCE NTMPI - Starting faucet..."
      break
    fi
    
    echo "Waiting for funds... (current: $BALANCE NTMPI)"
    sleep 30
  done
fi

echo ""
echo "Starting Timpi Drip..."
exec node dist/index.js
