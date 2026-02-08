#!/bin/bash
# Timpi Drip - Create Proxmox CT
# Run this on your Proxmox host

set -e

# Configuration
CT_ID="${1:-200}"
CT_HOSTNAME="${2:-timpi-drip}"
CT_MEMORY="${3:-1024}"
CT_CORES="${4:-2}"
CT_DISK="${5:-8}"
CT_STORAGE="${6:-local-lvm}"
CT_BRIDGE="${7:-vmbr0}"

# Find Debian 12 template
TEMPLATE=$(pveam list local 2>/dev/null | grep "debian-12" | head -1 | awk '{print $1}')

if [ -z "$TEMPLATE" ]; then
  echo "Debian 12 template not found. Downloading..."
  pveam update
  pveam download local debian-12-standard_12.2-1_amd64.tar.zst
  TEMPLATE="local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           CREATING TIMPI DRIP CT                             ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  CT ID:     $CT_ID"
echo "║  Hostname:  $CT_HOSTNAME"
echo "║  Memory:    ${CT_MEMORY}MB"
echo "║  Cores:     $CT_CORES"
echo "║  Disk:      ${CT_DISK}GB"
echo "║  Storage:   $CT_STORAGE"
echo "║  Bridge:    $CT_BRIDGE"
echo "║  Template:  $TEMPLATE"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

read -p "Continue? [y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

# Create CT
echo "Creating CT $CT_ID..."
pct create "$CT_ID" "$TEMPLATE" \
  --hostname "$CT_HOSTNAME" \
  --memory "$CT_MEMORY" \
  --swap 512 \
  --cores "$CT_CORES" \
  --rootfs "$CT_STORAGE:$CT_DISK" \
  --net0 "name=eth0,bridge=$CT_BRIDGE,ip=dhcp" \
  --features nesting=1 \
  --unprivileged 1 \
  --onboot 1

# Start CT
echo "Starting CT..."
pct start "$CT_ID"

# Wait for network
echo "Waiting for CT to boot..."
sleep 10

# Get IP
CT_IP=$(pct exec "$CT_ID" -- hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$CT_IP" ]; then
  echo "Waiting for IP..."
  sleep 10
  CT_IP=$(pct exec "$CT_ID" -- hostname -I 2>/dev/null | awk '{print $1}')
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    CT CREATED!                               ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  CT ID: $CT_ID"
echo "║  IP:    $CT_IP"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Next steps:                                                 ║"
echo "║                                                              ║"
echo "║  1. Enter CT:                                                ║"
echo "║     pct enter $CT_ID                                         ║"
echo "║                                                              ║"
echo "║  2. Run setup:                                               ║"
echo "║     curl -fsSL https://raw.githubusercontent.com/mhue-ai/    ║"
echo "║       timpi-faucet/main/deploy/proxmox/setup.sh | bash       ║"
echo "║                                                              ║"
echo "║  Or SSH:                                                     ║"
echo "║     ssh root@$CT_IP                                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
