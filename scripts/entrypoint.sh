#!/bin/sh
set -e

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
  echo ""
  
  # Use ClawPurse to init wallet (ESM compatible)
  node --input-type=module -e "
    import { initWallet } from 'clawpurse';
    
    const result = await initWallet(process.env.FAUCET_WALLET_PASSWORD, {
      keystorePath: '$KEYSTORE_FILE'
    });
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  FAUCET WALLET CREATED');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('  Address: ' + result.address);
    console.log('');
    console.log('  ⚠️  SAVE YOUR MNEMONIC - SHOWN ONCE ONLY:');
    console.log('');
    console.log('  ' + result.mnemonic);
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('  ⚠️  SECURITY WARNING:');
    console.log('     Clear this output from your terminal/logs after saving!');
    console.log('');
    console.log('  Next steps:');
    console.log('    1. Save the mnemonic securely');
    console.log('    2. Fund the address with NTMPI');
    console.log('    3. Container will auto-start when funds detected');
    console.log('');
  "
  
  if [ $? -ne 0 ]; then
    echo "ERROR: Failed to initialize wallet"
    exit 1
  fi
  
  echo ""
  echo "Wallet initialized. Waiting for funding..."
  echo "Checking balance every 30 seconds."
  echo ""
fi

# Wait for funding (if balance too low)
check_balance() {
  node --input-type=module -e "
    import { getBalance, loadKeystore } from 'clawpurse';
    try {
      const { address } = await loadKeystore(process.env.FAUCET_WALLET_PASSWORD, '$KEYSTORE_FILE');
      const bal = await getBalance(address);
      const amount = parseFloat(bal.primary.displayAmount);
      console.log(amount.toFixed(6));
      process.exit(amount >= 1 ? 0 : 1);
    } catch (e) {
      console.log('0');
      process.exit(1);
    }
  " 2>/dev/null
}

BALANCE=$(check_balance || echo "0")
if [ "$?" != "0" ] || [ "$(echo "$BALANCE" | head -1)" = "0" ]; then
  echo "Waiting for funds to be sent to the faucet wallet..."
  while true; do
    BALANCE=$(check_balance 2>/dev/null || echo "0")
    # Check if we have at least 1 NTMPI
    if check_balance >/dev/null 2>&1; then
      echo ""
      echo "Balance detected: $BALANCE NTMPI"
      echo "Starting faucet..."
      break
    fi
    echo "$(date '+%H:%M:%S') Waiting for funds... (current: $BALANCE NTMPI)"
    sleep 30
  done
fi

echo ""
echo "Starting Timpi Drip..."
exec node dist/index.js
