# Timpi Drip - Proxmox CT Deployment

## CT Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 1 core | 2 cores |
| RAM | 512 MB | 1 GB |
| Disk | 4 GB | 8 GB |
| OS | Debian 12 / Ubuntu 22.04 | Debian 12 |

## Quick Provision

### 1. Create CT in Proxmox

```bash
# On Proxmox host
pct create 200 local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst \
  --hostname timpi-drip \
  --memory 1024 \
  --swap 512 \
  --cores 2 \
  --rootfs local-lvm:8 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --features nesting=1 \
  --unprivileged 1 \
  --start 1
```

Or via Proxmox UI:
1. Create CT → Template: Debian 12
2. Hostname: `timpi-drip`
3. Resources: 2 cores, 1GB RAM, 8GB disk
4. Network: DHCP or static IP
5. Options → Features → Enable "Nesting" (required for Docker)
6. Start CT

### 2. Initial Setup (inside CT)

```bash
# Enter CT
pct enter 200

# Or SSH in
ssh root@<CT_IP>

# Run setup script
curl -fsSL https://raw.githubusercontent.com/mhue-ai/timpi-faucet/main/deploy/proxmox/setup.sh | bash
```

### 3. Configure & Deploy

```bash
cd /opt/timpi-drip

# Edit configuration
nano .env

# Start (first run will create wallet)
docker-compose up -d

# Watch logs for wallet address
docker-compose logs -f
```

### 4. Fund & Go

1. Copy the wallet address from logs
2. Send NTMPI to that address
3. Container auto-starts when funds detected

## Manual Setup

If you prefer not to use the setup script:

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install docker-compose
apt install -y docker-compose-plugin

# Clone repo
git clone https://github.com/mhue-ai/timpi-faucet.git /opt/timpi-drip
cd /opt/timpi-drip

# Configure
cp .env.example .env
nano .env  # Set passwords

# Deploy
docker compose up -d
```

## Firewall

Open port 3000 (or your chosen port):

```bash
# If using ufw
ufw allow 3000/tcp

# If using iptables
iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
```

## Reverse Proxy (Optional)

For SSL termination, add nginx:

```bash
apt install -y nginx certbot python3-certbot-nginx

# Configure nginx
cat > /etc/nginx/sites-available/drip << 'EOF'
server {
    listen 80;
    server_name drip.clawpurse.ai;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

ln -s /etc/nginx/sites-available/drip /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Get SSL cert
certbot --nginx -d drip.clawpurse.ai
```

## Backup

```bash
# Backup data volume
docker run --rm -v timpi-drip-data:/data -v /backup:/backup alpine \
  tar czf /backup/drip-$(date +%Y%m%d).tar.gz /data

# Copy to Proxmox host
pct pull 200 /backup/drip-*.tar.gz /var/backups/
```

## Monitoring

```bash
# Check status
docker compose ps

# View logs
docker compose logs -f

# Check health
curl http://localhost:3000/health
```
