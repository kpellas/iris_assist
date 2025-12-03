# iPad POC Quick Start Guide

## 🚀 Get Running in 5 Minutes

### Prerequisites
- Node.js installed
- PostgreSQL running
- Google OAuth credentials (optional, for Drive/Gmail)

### Step 1: Clone and Setup
```bash
git clone <your-repo>
cd kelly-assistant

# Run automated setup
./setup.sh all
```

### Step 2: Configure Environment
```bash
# Edit .env file
nano .env

# Add your Google credentials:
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

### Step 3: Start Everything
```bash
# Terminal 1: Start backend
cd backend
npm run dev

# Terminal 2: Start iPad app
cd ipad-app
npm start
```

### Step 4: Access on iPad
1. Find your computer's IP: `ifconfig | grep inet`
2. On iPad browser, go to: `http://YOUR_COMPUTER_IP:3001`
3. Login with default credentials:
   - Username: `admin`
   - Password: `changeme123!`

## 📱 iPad App Features

### Voice Commands (using iPad microphone)
- "Remember my meeting is at 3pm"
- "What did I say about the budget?"
- "Search my drive for presentation"
- "Check my email"
- "Create a task to call John"

### Touch Interface
- Dashboard with widgets
- Task management
- Memory search
- Protocol execution
- Google Drive browser
- Email viewer

### Real-time Updates
- WebSocket connection for instant updates
- Multi-device sync
- Push notifications for important events

## 🔧 Development Setup

### Backend API Testing
```bash
# Get auth token
./setup.sh token

# Test memory storage
curl -X POST http://localhost:3000/api/memory \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "Test memory", "userId": "admin"}'

# Test Google OAuth
./setup.sh google
```

### iPad App Development
```bash
# Hot reload enabled
cd ipad-app
npm start

# Build for production
npm run build
```

### Update Backend URL (for remote backend)
```javascript
// ipad-app/src/config.ts
export const config = {
  BACKEND_URL: 'https://your-backend.com',
  WS_URL: 'wss://your-backend.com',
};
```

## 🎯 Testing Checklist

### Core Features
- [ ] Login/logout working
- [ ] Memory storage and retrieval
- [ ] Task creation and management
- [ ] Protocol execution
- [ ] WebSocket real-time updates

### Google Integration
- [ ] OAuth flow completes
- [ ] Drive search working
- [ ] Email retrieval working
- [ ] Document creation

### iPad Specific
- [ ] Touch gestures working
- [ ] Voice input (Web Speech API)
- [ ] Responsive layout
- [ ] Offline mode (PWA)

## 📝 Common Commands

### Backend Management
```bash
# View logs
tail -f backend/logs/app.log

# Database console
psql -U postgres -d kelly_assistant

# Run migrations
cd backend
psql -U postgres -d kelly_assistant -f database/001_init.sql
```

### iPad App
```bash
# Install new dependency
cd ipad-app
npm install package-name

# Check bundle size
npm run analyze

# Run tests
npm test
```

## 🚨 Troubleshooting

### "Cannot connect to backend"
1. Check backend is running: `curl http://localhost:3000/health`
2. Check CORS settings in backend
3. Verify iPad and computer are on same network
4. Check firewall settings

### "Authentication failed"
1. Verify JWT_SECRET is set in .env
2. Check token hasn't expired (24h default)
3. Try getting new token: `./setup.sh token`

### "Google OAuth not working"
1. Verify credentials in .env
2. Check redirect URI matches exactly
3. Ensure APIs enabled in Google Console
4. Try manual auth: `./setup.sh google`

### "WebSocket disconnected"
1. Check WS_URL in config
2. Verify no proxy blocking WebSocket
3. Check backend WebSocket logs

## 🎨 Customization

### Theme Configuration
```javascript
// ipad-app/src/theme.ts
export const theme = {
  primary: '#007AFF',  // iOS blue
  background: '#F2F2F7',
  text: '#000000',
};
```

### Add Custom Widget
```tsx
// ipad-app/src/widgets/CustomWidget.tsx
export const CustomWidget = () => {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    ApiService.getCustomData().then(setData);
  }, []);
  
  return <WidgetCard title="Custom">{data}</WidgetCard>;
};
```

### Voice Command Processing
```javascript
// ipad-app/src/services/VoiceService.ts
export const processVoiceCommand = (transcript: string) => {
  // Add custom command patterns
  if (transcript.includes('weather')) {
    return fetchWeather();
  }
  // Default processing
  return ApiService.processCommand(transcript);
};
```

## 🚀 Next Steps

1. **Deploy Backend**
   - Set up cloud server (AWS/DigitalOcean)
   - Configure HTTPS with Let's Encrypt
   - Set up database backups

2. **Enhance iPad App**
   - Add offline support (PWA)
   - Implement push notifications
   - Add biometric authentication

3. **Prepare for Pi**
   - Build optimized production bundle
   - Test on Pi's Chromium browser
   - Set up kiosk mode

4. **Add Features**
   - Calendar integration
   - Smart home controls
   - Custom automation rules

## 📚 Resources

- [API Documentation](./API_DOCS.md)
- [Security Guide](./SECURITY_IMPROVEMENTS.md)
- [Raspberry Pi Deployment](./RASPBERRY_PI_DEPLOYMENT.md)
- [Production Auth Guide](./PRODUCTION_AUTH_AUDIT.md)

## Support

For issues or questions:
1. Check logs: `tail -f backend/logs/*.log`
2. Run diagnostics: `./setup.sh test`
3. Review [Common Issues](./TROUBLESHOOTING.md)