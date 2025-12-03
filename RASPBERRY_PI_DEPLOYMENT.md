# Raspberry Pi Deployment Guide

## Overview
Deploy Kelly Assistant on Raspberry Pi with a touchscreen interface, optional voice control, and secure backend connection.

## Hardware Requirements
- Raspberry Pi 4 (4GB+ RAM recommended)
- Official 7" touchscreen or HDMI display
- MicroSD card (32GB+)
- USB microphone (optional, for voice)
- Speaker (optional, for TTS)

## Software Stack
- Raspberry Pi OS (64-bit)
- Chromium in kiosk mode
- Node.js backend (local or remote)
- PostgreSQL database
- Optional: Voice recognition service

## 1. Initial Pi Setup

### Install Raspberry Pi OS
```bash
# Use Raspberry Pi Imager to flash the latest 64-bit OS
# Enable SSH during setup for remote management
```

### Basic Configuration
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y \
  chromium-browser \
  postgresql \
  postgresql-contrib \
  nodejs \
  npm \
  git \
  nginx \
  certbot \
  python3-pip

# Install pgvector
cd /tmp
git clone https://github.com/pgvector/pgvector.git
cd pgvector
make
sudo make install
```

## 2. Backend Deployment Options

### Option A: Local Backend (All on Pi)

```bash
# Clone repository
cd /home/pi
git clone https://github.com/yourusername/kelly-assistant.git
cd kelly-assistant

# Setup environment
cp .env.example .env
# Edit .env with your credentials
nano .env

# Install and setup backend
cd backend
npm install
npm run build

# Setup PostgreSQL
sudo -u postgres createuser kellypellas
sudo -u postgres createdb kelly_assistant
psql -U postgres -d kelly_assistant -f database/schema.sql

# Create systemd service
sudo tee /etc/systemd/system/kelly-backend.service << EOF
[Unit]
Description=Kelly Assistant Backend
After=network.target postgresql.service

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/kelly-assistant/backend
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
Environment="NODE_ENV=production"
EnvironmentFile=/home/pi/kelly-assistant/.env

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable kelly-backend
sudo systemctl start kelly-backend
```

### Option B: Remote Backend (Recommended for multiple Pis)

```bash
# Backend runs on a cloud server (AWS, DigitalOcean, etc.)
# Pi only runs the frontend UI
# Update .env with remote backend URL
REACT_APP_BACKEND_URL=https://kelly-api.yourdomain.com
REACT_APP_WS_URL=wss://kelly-api.yourdomain.com
```

## 3. Frontend Setup (Kiosk Mode)

### Build Frontend for Production
```bash
cd /home/pi/kelly-assistant/ipad-app
npm install
npm run build

# Serve with nginx
sudo cp -r build/* /var/www/html/
```

### Configure Nginx
```bash
sudo tee /etc/nginx/sites-available/kelly-assistant << 'EOF'
server {
    listen 80;
    server_name kelly.local;
    root /var/www/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to backend (if local)
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support
    location /socket.io {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/kelly-assistant /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

### Setup Kiosk Mode
```bash
# Create kiosk script
mkdir -p /home/pi/.config/autostart
tee /home/pi/kiosk.sh << 'EOF'
#!/bin/bash
# Disable screen saver
xset s noblank
xset s off
xset -dpms

# Hide cursor after 5 seconds
unclutter -idle 5 -root &

# Remove Chromium crash bubble
sed -i 's/"exited_cleanly":false/"exited_cleanly":true/' /home/pi/.config/chromium/Default/Preferences
sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/' /home/pi/.config/chromium/Default/Preferences

# Launch Chromium in kiosk mode
chromium-browser \
    --noerrdialogs \
    --disable-infobars \
    --kiosk http://localhost \
    --check-for-update-interval=31536000 \
    --disable-component-update
EOF

chmod +x /home/pi/kiosk.sh

# Create autostart entry
tee /home/pi/.config/autostart/kiosk.desktop << EOF
[Desktop Entry]
Type=Application
Name=Kelly Assistant Kiosk
Exec=/home/pi/kiosk.sh
Hidden=false
X-GNOME-Autostart-enabled=true
EOF
```

## 4. HTTPS Setup (Production)

### For Local Network (self-signed)
```bash
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/ssl/private/kelly.key \
    -out /etc/ssl/certs/kelly.crt \
    -subj "/CN=kelly.local"

# Update nginx to use SSL
sudo sed -i 's/listen 80;/listen 443 ssl;\n    ssl_certificate \/etc\/ssl\/certs\/kelly.crt;\n    ssl_certificate_key \/etc\/ssl\/private\/kelly.key;/' /etc/nginx/sites-available/kelly-assistant
sudo systemctl restart nginx
```

### For Internet Access (Let's Encrypt)
```bash
sudo certbot --nginx -d kelly.yourdomain.com
```

## 5. Optional Voice Integration

### Option A: Web Speech API (Browser-based)
```javascript
// Already supported in the iPad app
// Works with Chromium's built-in speech recognition
```

### Option B: Local Speech Recognition
```bash
# Install speech recognition
pip3 install SpeechRecognition pyaudio

# Create voice service
tee /home/pi/voice_service.py << 'EOF'
import speech_recognition as sr
import requests
import json

API_URL = "http://localhost:3000/api"
TOKEN = "YOUR_JWT_TOKEN"  # Get from login

def listen_and_process():
    r = sr.Recognizer()
    mic = sr.Microphone()
    
    with mic as source:
        r.adjust_for_ambient_noise(source)
        print("Listening...")
        audio = r.listen(source)
        
    try:
        text = r.recognize_google(audio)
        print(f"You said: {text}")
        
        # Send to backend
        response = requests.post(
            f"{API_URL}/command",
            headers={"Authorization": f"Bearer {TOKEN}"},
            json={"command": text}
        )
        print(response.json())
        
    except sr.UnknownValueError:
        print("Could not understand audio")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    while True:
        listen_and_process()
EOF

# Run as service
sudo tee /etc/systemd/system/kelly-voice.service << EOF
[Unit]
Description=Kelly Voice Service
After=kelly-backend.service

[Service]
Type=simple
User=pi
ExecStart=/usr/bin/python3 /home/pi/voice_service.py
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable kelly-voice
sudo systemctl start kelly-voice
```

## 6. Performance Optimization

### Raspberry Pi Tweaks
```bash
# Increase GPU memory split
echo "gpu_mem=128" | sudo tee -a /boot/config.txt

# Enable hardware acceleration
echo "dtoverlay=vc4-fkms-v3d" | sudo tee -a /boot/config.txt

# Optimize PostgreSQL for Pi
sudo tee -a /etc/postgresql/*/main/postgresql.conf << EOF
shared_buffers = 256MB
work_mem = 4MB
maintenance_work_mem = 64MB
effective_cache_size = 1GB
EOF

sudo systemctl restart postgresql
```

### Frontend Optimization
```javascript
// In ipad-app/src/config.ts
export const config = {
  ui: {
    refreshInterval: 10000, // Reduce polling frequency
    enableAnimations: false, // Disable animations on Pi
  }
};
```

## 7. Multi-Pi Setup

### Central Backend Server
```bash
# Deploy backend to cloud server
# Use docker-compose for easy deployment
tee docker-compose.yml << EOF
version: '3.8'
services:
  backend:
    build: ./backend
    environment:
      - NODE_ENV=production
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis
  
  postgres:
    image: pgvector/pgvector:pg15
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: kelly_assistant
      POSTGRES_USER: kellypellas
      POSTGRES_PASSWORD: secure_password
  
  redis:
    image: redis:alpine
    
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./certs:/etc/nginx/certs
    depends_on:
      - backend

volumes:
  postgres_data:
EOF
```

### Configure Each Pi
```bash
# On each Raspberry Pi, just run the frontend
# Point to central backend
REACT_APP_BACKEND_URL=https://central-server.com
```

## 8. Monitoring & Maintenance

### Health Check Script
```bash
tee /home/pi/health_check.sh << 'EOF'
#!/bin/bash

# Check backend
curl -f http://localhost:3000/health || {
  echo "Backend down, restarting..."
  sudo systemctl restart kelly-backend
}

# Check display
pgrep chromium || {
  echo "Kiosk down, restarting..."
  /home/pi/kiosk.sh &
}
EOF

# Add to crontab
(crontab -l 2>/dev/null; echo "*/5 * * * * /home/pi/health_check.sh") | crontab -
```

### Log Rotation
```bash
sudo tee /etc/logrotate.d/kelly-assistant << EOF
/home/pi/kelly-assistant/backend/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    notifempty
    create 0640 pi pi
    sharedscripts
    postrotate
        systemctl reload kelly-backend
    endscript
}
EOF
```

## 9. Security Hardening

```bash
# Firewall rules
sudo ufw allow 22/tcp  # SSH
sudo ufw allow 80/tcp  # HTTP
sudo ufw allow 443/tcp # HTTPS
sudo ufw enable

# Fail2ban for SSH protection
sudo apt install fail2ban
sudo systemctl enable fail2ban

# Disable unnecessary services
sudo systemctl disable bluetooth
sudo systemctl disable avahi-daemon

# Read-only filesystem (optional, for kiosk stability)
# Add to /boot/cmdline.txt: boot=overlay
```

## 10. Quick Start Commands

```bash
# Complete setup
curl -sSL https://raw.githubusercontent.com/yourusername/kelly-assistant/main/pi-setup.sh | bash

# Start all services
sudo systemctl start kelly-backend kelly-voice nginx

# View logs
journalctl -u kelly-backend -f
journalctl -u kelly-voice -f

# Restart kiosk
pkill chromium && /home/pi/kiosk.sh &

# Update application
cd /home/pi/kelly-assistant
git pull
cd backend && npm install && npm run build
cd ../ipad-app && npm install && npm run build
sudo systemctl restart kelly-backend
```

## Troubleshooting

### Display Issues
- Check `raspi-config` for display settings
- Verify HDMI/DSI cable connections
- Test with `DISPLAY=:0 chromium-browser`

### Performance Issues
- Monitor with `htop`
- Check disk space with `df -h`
- Review logs in `/var/log/syslog`

### Network Issues
- Test connectivity: `ping google.com`
- Check firewall: `sudo ufw status`
- Verify nginx: `sudo nginx -t`

## Next Steps

1. **Add wake word detection** for hands-free operation
2. **Implement local TTS** using espeak or pyttsx3
3. **Add camera integration** for visual recognition
4. **Create custom hardware buttons** using GPIO
5. **Build multi-room system** with MQTT communication