import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { SecureTokenService } from './SecureTokenService';
import readline from 'readline';

export class GoogleAuthService {
  private oauth2Client: OAuth2Client;
  private tokenService: SecureTokenService;
  private userId: string;
  private stateStore: Map<string, { 
    userId: string; 
    expires: number;
    codeVerifier?: string;
  }> = new Map();
  
  // Scopes for Gmail and Drive access
  private SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive.metadata.readonly'
  ];
  
  constructor(userId: string = 'default') {
    // Initialize OAuth2 client with credentials from environment
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';
    
    this.oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );
    
    this.tokenService = SecureTokenService.getInstance();
    this.userId = userId;
    
    // Clean up expired states periodically
    this.cleanupExpiredStates();
  }
  
  async initialize(): Promise<boolean> {
    try {
      // Try to load existing token from secure storage
      const token = await this.tokenService.getTokens(this.userId);
      if (token) {
        this.oauth2Client.setCredentials(token);
        
        // Check if token is expired
        if (this.isTokenExpired(token)) {
          console.log('Token expired, refreshing...');
          await this.refreshAccessToken();
        }
        
        return true;
      }
      
      console.log('No token found for user. Need to authorize.');
      return false;
    } catch (error) {
      console.error('Error initializing Google auth:', error);
      return false;
    }
  }
  
  /**
   * Generate auth URL with state and PKCE for enhanced security
   */
  getAuthUrl(userId: string): { url: string; state: string; codeChallenge?: string } {
    const state = this.tokenService.generateState();
    
    // Generate PKCE challenge
    const pkce = this.tokenService.generatePKCE();
    
    // Store state with PKCE verifier and expiration (5 minutes)
    this.stateStore.set(state, {
      userId,
      expires: Date.now() + 5 * 60 * 1000,
      codeVerifier: pkce.verifier
    });
    
    const authUrlParams: any = {
      access_type: 'offline',
      scope: this.SCOPES,
      prompt: 'consent',
      state,
      code_challenge: pkce.challenge,
      code_challenge_method: 'S256'
    };
    
    const url = this.oauth2Client.generateAuthUrl(authUrlParams);
    
    return { url, state, codeChallenge: pkce.challenge };
  }
  
  /**
   * Exchange authorization code for tokens with state validation and PKCE
   */
  async getTokenFromCode(code: string, state: string): Promise<any> {
    try {
      // Validate state
      const stateData = this.stateStore.get(state);
      if (!stateData) {
        throw new Error('Invalid state parameter');
      }
      
      if (Date.now() > stateData.expires) {
        this.stateStore.delete(state);
        throw new Error('State parameter expired');
      }
      
      // Exchange code for tokens with PKCE verifier
      const tokenParams: any = {
        code,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback'
      };
      
      // Include PKCE verifier if present
      if (stateData.codeVerifier) {
        tokenParams.codeVerifier = stateData.codeVerifier;
      }
      
      const { tokens } = await this.oauth2Client.getToken(tokenParams);
      this.oauth2Client.setCredentials(tokens);
      
      // Store tokens securely for the user
      await this.tokenService.storeTokens(stateData.userId, tokens);
      
      // Clean up state
      this.stateStore.delete(state);
      
      return tokens;
    } catch (error) {
      console.error('Error getting token from code:', error);
      throw error;
    }
  }
  
  /**
   * Clean up expired state entries
   */
  private cleanupExpiredStates() {
    setInterval(() => {
      const now = Date.now();
      for (const [state, data] of this.stateStore.entries()) {
        if (now > data.expires) {
          this.stateStore.delete(state);
        }
      }
    }, 60000); // Clean up every minute
  }
  
  /**
   * Check if token is expired
   */
  private isTokenExpired(token: any): boolean {
    if (!token.expiry_date) return true;
    return Date.now() >= token.expiry_date;
  }
  
  /**
   * Refresh the access token
   */
  private async refreshAccessToken(): Promise<void> {
    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      this.oauth2Client.setCredentials(credentials);
      await this.tokenService.storeTokens(this.userId, credentials);
      console.log('Access token refreshed for user:', this.userId);
    } catch (error) {
      console.error('Error refreshing access token:', error);
      throw error;
    }
  }
  
  /**
   * Get authenticated OAuth2 client
   */
  getAuthClient(): OAuth2Client {
    return this.oauth2Client;
  }
  
  /**
   * Setup authorization flow via command line (for initial setup)
   */
  async authorizeWithCLI(): Promise<void> {
    const authUrl = this.getAuthUrl();
    console.log('Authorize this app by visiting this url:');
    console.log(authUrl);
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    return new Promise((resolve, reject) => {
      rl.question('Enter the code from that page here: ', async (code) => {
        rl.close();
        try {
          // For CLI, we'll use a dummy state
          const { state } = this.getAuthUrl(this.userId);
          await this.getTokenFromCode(code, state);
          console.log('Authorization successful!');
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }
}