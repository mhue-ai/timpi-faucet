#!/bin/bash
# Timpi Drip - Proxmox CT Setup Script
# Run inside a fresh Debian 12 or Ubuntu 22.04 CT

set -e

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           TIMPI DRIP - PROXMOX CT SETUP                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root"
  exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS=$ID
  VER=$VERSION_ID
else
  echo "Cannot detect OS"
  exit 1
fi

echo "Detected: $OS $VER"
echo ""

# Update system
echo ">>> Updating system packages..."
apt update && apt upgrade -y

# Install dependencies
echo ">>> Installing dependencies..."
apt install -y \
  curl \
  git \
  ca-certificates \
  gnupg \
  lsb-release

# Install Docker
if ! command -v docker &> /dev/null; then
  echo ">>> Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
else
  echo ">>> Docker already installed"
fi

# Install docker-compose plugin if not present
if ! docker compose version &> /dev/null; then
  echo ">>> Installing Docker Compose plugin..."
  apt install -y docker-compose-plugin
fi

# Create app directory
APP_DIR="/opt/timpi-drip"
echo ">>> Setting up application in $APP_DIR..."

if [ -d "$APP_DIR" ]; then
  echo "Directory exists, pulling latest..."
  cd "$APP_DIR"
  git pull origin main
else
  git clone https://github.com/mhue-ai/timpi-faucet.git "$APP_DIR"
  cd "$APP_DIR"
fi

# Generate secure passwords if not exists
ENV_FILE="$APP_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo ">>> Creating .env file with secure passwords..."
  
  WALLET_PASS=$(openssl rand -base64 32 | tr -d '=+/' | head -c 32)
  ADMIN_PASS=$(openssl rand -base64 16 | tr -d '=+/' | head -c 16)
  
  cat > "$ENV_FILE" << EOF
# Timpi Drip Configuration
# Generated: $(date -Iseconds)

# Wallet password (auto-generated, save this!)
FAUCET_WALLET_PASSWORD=$WALLET_PASS

# Admin password (auto-generated, save this!)
ADMIN_PASSWORD=$ADMIN_PASS

# Admin IP allowlist (add your IP)
ADMIN_IP_ALLOWLIST=127.0.0.1,::1

# Drip amounts (NTMPI)
DRIP_AMOUNT_NEW=0.5
DRIP_AMOUNT_TRUSTED=1.0

# Cooldowns (hours)
COOLDOWN_NEW=48
COOLDOWN_TRUSTED=24

# PoW difficulty (4 = ~65k attempts)
POW_DIFFICULTY=4

# Alerts (optional)
DISCORD_WEBHOOK=
EOF

  chmod 600 "$ENV_FILE"
  
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  GENERATED CREDENTIALS - SAVE THESE!"
  echo "═══════════════════════════════════════════════════════════════"
  echo ""
  echo "  Wallet Password: $WALLET_PASS"
  echo "  Admin Password:  $ADMIN_PASS"
  echo ""
  echo "  Stored in: $ENV_FILE"
  echo "═══════════════════════════════════════════════════════════════"
  echo ""
else
  echo ">>> .env file exists, skipping credential generation"
fi

# Create systemd service for auto-start
echo ">>> Creating systemd service..."
cat > /etc/systemd/system/timpi-drip.service << EOF
[Unit]
Description=Timpi Drip Faucet
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable timpi-drip.service

# Build Docker image
echo ">>> Building Docker image..."
cd "$APP_DIR"
docker compose build

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    SETUP COMPLETE!                           ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║  Next steps:                                                 ║"
echo "║                                                              ║"
echo "║  1. Review config:                                           ║"
echo "║     nano /opt/timpi-drip/.env                                ║"
echo "║                                                              ║"
echo "║  2. Add your IP to ADMIN_IP_ALLOWLIST                        ║"
echo "║                                                              ║"
echo "║  3. Start the faucet:                                        ║"
echo "║     cd /opt/timpi-drip && docker compose up -d               ║"
echo "║                                                              ║"
echo "║  4. Watch logs for wallet address:                           ║"
echo "║     docker compose logs -f                                   ║"
echo "║                                                              ║"
echo "║  5. Fund the wallet with NTMPI                               ║"
echo "║                                                              ║"
echo "║  6. Access:                                                  ║"
echo "║     Public:  http://<CT_IP>:3000                             ║"
echo "║     Admin:   http://<CT_IP>:3000/admin.html                  ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
