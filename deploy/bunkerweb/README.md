# Timpi Drip - BunkerWeb Deployment

Stack: **Cloudflare → BunkerWeb → Timpi Drip**

## Security Layers

| Layer | Protection |
|-------|------------|
| Cloudflare | SSL termination, DDoS, CDN |
| BunkerWeb | WAF (ModSecurity + OWASP CRS), rate limiting, IP whitelist |
| App | PoW, per-address cooldowns, admin IP allowlist |

## Key Security Settings

### Cloudflare-Only Access
- Only Cloudflare IPs can reach BunkerWeb
- Direct access to server IP is blocked
- Real client IP from `CF-Connecting-IP` header

### Rate Limiting
- General: 30 req/sec burst 60
- `/api/drip`: 5 req/sec burst 10

### WAF
- ModSecurity with OWASP Core Rule Set
- Blocks SQL injection, XSS, path traversal

### What's Disabled
- **Anti-bot**: OFF (CLI/agents need access)
- **SSL**: OFF (Cloudflare handles termination)
- **CAPTCHA**: Not used (PoW instead)

## Deploy

```bash
cd deploy/bunkerweb

# Configure
cp ../../.env.example .env
nano .env  # Set passwords + your IP

# Run
docker compose up -d

# Logs
docker compose logs -f
```

## Cloudflare Settings

1. **DNS**: A record → CT IP (proxied/orange cloud)
2. **SSL/TLS**: Full (not Full Strict, since BunkerWeb has no cert)
3. **Firewall Rules** (optional extra):
   - Challenge requests to `/admin*` from non-allowlisted countries

## Admin Access

Your real IP must be in `ADMIN_IP_ALLOWLIST` in `.env`:

```bash
# Find your IP
curl ifconfig.me

# Add to .env
ADMIN_IP_ALLOWLIST=YOUR.REAL.IP.HERE
```

## Troubleshooting

### Can't access site
- Check BunkerWeb logs: `docker compose logs bunkerweb`
- Verify Cloudflare proxy is ON (orange cloud)
- Confirm your IP is being passed correctly

### Admin login fails
- Verify your IP is in allowlist
- Check BunkerWeb isn't blocking you (check logs for 403s)
- Try from Cloudflare-proxied connection only

### WAF blocking legitimate requests
Add custom exclusions to `bunkerweb.conf`:
```
MODSECURITY_SEC_RULE_EXCLUSIONS=920350 921180
```
