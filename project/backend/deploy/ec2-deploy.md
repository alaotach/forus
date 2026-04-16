# EC2 Deployment Runbook (Ubuntu)

## 1. Launch EC2
- AMI: Ubuntu 22.04/24.04 LTS
- Instance type: t3.small (minimum recommended)
- Security Group inbound:
  - 22 (SSH) from your IP only
  - 80 (HTTP) from 0.0.0.0/0
  - 443 (HTTPS) from 0.0.0.0/0

## 2. Attach IAM Role (recommended, no static keys)
Attach an instance profile role with permissions:
- s3:PutObject/GetObject/DeleteObject on bucket uploads prefix
- s3:ListBucket on uploads prefix
- dynamodb:PutItem/GetItem/DeleteItem on media metadata table

If using IAM role, do NOT set AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY in .env.

## 3. Server bootstrap
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 4. Deploy app code
```bash
# You already have code at /home/aloo/forus
cd /home/aloo/forus/project/backend
npm ci --omit=dev
```

## 5. Create backend env
```bash
cp .env.example .env
nano .env
```
Set at least:
- NODE_ENV=production
- PORT=3000
- PUBLIC_BASE_URL=https://api.yourdomain.com
- HACKCLUB_API_KEY=...
- AWS_REGION=...
- AWS_S3_BUCKET=...
- AWS_MEDIA_TABLE=...
- MEDIA_AUTH_JWT_SECRET=...
- MEDIA_AUTH_TOKEN_TTL_SECONDS=3600
- S3_MAX_UPLOAD_BYTES=20971520
- S3_UPLOAD_URL_TTL_SECONDS=300
- S3_DOWNLOAD_URL_TTL_SECONDS=120
- ALLOWED_ORIGINS=https://your-app-domain.com

## 6. Install systemd service
```bash
sudo cp /home/aloo/forus/project/backend/deploy/forus-backend.service /etc/systemd/system/forus-backend.service
sudo systemctl daemon-reload
sudo systemctl enable forus-backend
sudo systemctl start forus-backend
sudo systemctl status forus-backend --no-pager
```

## 7. Configure Nginx reverse proxy
```bash
sudo cp /home/aloo/forus/project/backend/deploy/nginx-forus-backend.conf /etc/nginx/sites-available/forus-backend
sudo sed -i 's/api.example.com/api.yourdomain.com/g' /etc/nginx/sites-available/forus-backend
sudo ln -sf /etc/nginx/sites-available/forus-backend /etc/nginx/sites-enabled/forus-backend
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
```

## 8. Enable HTTPS (Let's Encrypt)
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

## 8.1 Optional firewall (UFW)
```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

## 9. Validate
```bash
curl -sS http://127.0.0.1:3000/health
curl -sS https://api.yourdomain.com/health
```

## 10. Logs and operations
```bash
sudo journalctl -u forus-backend -f
sudo systemctl restart forus-backend
sudo systemctl restart nginx
```
