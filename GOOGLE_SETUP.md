# Google Integration Setup Guide

## Prerequisites

1. Google Cloud Console account
2. Google OAuth2 credentials
3. Kelly Assistant backend running

## Setup Steps

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable the following APIs:
   - Google Drive API
   - Gmail API

### 2. Create OAuth2 Credentials

1. Go to APIs & Services > Credentials
2. Click "Create Credentials" > "OAuth client ID"
3. Application type: "Web application"
4. Add authorized redirect URI: `http://localhost:3000/auth/google/callback`
5. Save the credentials

### 3. Configure Environment Variables

Add to your `.env` file:

```bash
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

### 4. Authorize the Application

1. Start the backend server:
   ```bash
   npm run dev
   ```

2. Get the authorization URL:
   ```bash
   curl http://localhost:3000/api/google/auth/url
   ```

3. Visit the URL in your browser
4. Authorize the application
5. Copy the authorization code from the redirect URL
6. Exchange the code for tokens:
   ```bash
   curl -X POST 'http://localhost:3000/api/google/auth/callback' \
     -H 'Content-Type: application/json' \
     -d '{"code": "YOUR_AUTH_CODE_HERE"}'
   ```

The tokens will be saved to `google-token.json` and will auto-refresh when needed.

## Available Features

### Google Drive
- Search files: "Alexa, ask Kelly Assistant to search my drive for budget"
- Create documents: "Alexa, ask Kelly Assistant to create a document called meeting notes"
- Get recent files

### Gmail
- Check emails: "Alexa, ask Kelly Assistant to check my email"
- Search emails: "Alexa, ask Kelly Assistant to search my email for invoice"
- Send emails (via API)
- Read emails from specific senders

## API Endpoints

### Authentication
- `GET /api/google/auth/url` - Get OAuth2 authorization URL
- `POST /api/google/auth/callback` - Exchange code for tokens

### Google Drive
- `GET /api/google/drive/search?query=term` - Search files
- `GET /api/google/drive/recent` - Get recent files
- `POST /api/google/drive/create` - Create document

### Gmail
- `GET /api/google/gmail/messages` - List messages
- `GET /api/google/gmail/unread` - Get unread emails
- `GET /api/google/gmail/search?query=term` - Search emails
- `POST /api/google/gmail/send` - Send email

## Testing

Run the test script:
```bash
./test-google-api.sh
```

## Troubleshooting

1. **Authentication fails**: Check that redirect URI matches exactly
2. **APIs not working**: Ensure APIs are enabled in Google Cloud Console
3. **Token expired**: The system auto-refreshes, but you can re-authorize if needed
4. **Permission denied**: Check OAuth2 scopes match required permissions