// Configuration for iPad app
export const config = {
  // Backend API URL
  BACKEND_URL: import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000',
  
  // WebSocket URL
  WS_URL: import.meta.env.VITE_WS_URL || 'ws://localhost:3000',
  
  // Auth token storage key
  TOKEN_KEY: 'kelly_assistant_token',
  
  // App settings
  APP_NAME: 'Kelly Assistant',
  VERSION: '1.0.0',
  
  // Feature flags
  features: {
    voice: true,
    googleIntegration: true,
    protocols: true,
    tasks: true,
    memory: true,
  },
  
  // UI settings
  ui: {
    theme: 'light', // 'light' | 'dark' | 'auto'
    refreshInterval: 5000, // ms
    notificationDuration: 3000, // ms
  },
};

// For production deployment on Raspberry Pi
export const productionConfig = {
  BACKEND_URL: 'https://kelly-assistant.local',
  WS_URL: 'wss://kelly-assistant.local',
};