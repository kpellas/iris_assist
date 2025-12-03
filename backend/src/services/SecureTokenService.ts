import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { SSMClient, GetParameterCommand, PutParameterCommand } from '@aws-sdk/client-ssm';
import { SecretsManagerClient, GetSecretValueCommand, PutSecretValueCommand } from '@aws-sdk/client-secrets-manager';

interface TokenData {
  access_token?: string;
  refresh_token?: string;
  expiry_date?: number;
  scope?: string;
  token_type?: string;
}

interface UserTokens {
  [userId: string]: {
    tokens: TokenData;
    encryptedAt: string;
  };
}

export class SecureTokenService {
  private static instance: SecureTokenService;
  private encryptionKey: Buffer;
  private algorithm = 'aes-256-gcm';
  private ssmClient?: SSMClient;
  private secretsClient?: SecretsManagerClient;
  private storageMode: 'local' | 'ssm' | 'secrets-manager';
  private tokenFilePath = path.join(process.cwd(), '.tokens.encrypted');
  
  constructor() {
    // Require TOKEN_ENCRYPTION_KEY for security
    const key = process.env.TOKEN_ENCRYPTION_KEY;
    if (!key) {
      throw new Error('TOKEN_ENCRYPTION_KEY environment variable is required for security');
    }
    
    // Validate key length (must be 32 bytes / 64 hex chars)
    if (key.length !== 64) {
      throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
    }
    
    this.encryptionKey = Buffer.from(key, 'hex');
    
    // Determine storage mode based on environment
    if (process.env.AWS_REGION && process.env.USE_AWS_SECRETS === 'true') {
      this.storageMode = process.env.USE_SSM === 'true' ? 'ssm' : 'secrets-manager';
      this.initializeAWSClients();
    } else {
      this.storageMode = 'local';
      this.ensureSecureFilePermissions();
    }
  }
  
  static getInstance(): SecureTokenService {
    if (!SecureTokenService.instance) {
      SecureTokenService.instance = new SecureTokenService();
    }
    return SecureTokenService.instance;
  }
  
  private initializeAWSClients() {
    const region = process.env.AWS_REGION || 'us-east-1';
    
    if (this.storageMode === 'ssm') {
      this.ssmClient = new SSMClient({ region });
    } else {
      this.secretsClient = new SecretsManagerClient({ region });
    }
  }
  
  private async ensureSecureFilePermissions() {
    if (this.storageMode !== 'local') return;
    
    try {
      // Set restrictive permissions (owner read/write only - 600)
      await fs.chmod(this.tokenFilePath, 0o600);
    } catch (error) {
      // File might not exist yet, which is fine
    }
  }
  
  /**
   * Encrypt data using AES-256-GCM
   */
  private encrypt(data: string): { encrypted: string; iv: string; authTag: string } {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }
  
  /**
   * Decrypt data using AES-256-GCM
   */
  private decrypt(encrypted: string, iv: string, authTag: string): string {
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.encryptionKey,
      Buffer.from(iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
  
  /**
   * Store tokens for a user
   */
  async storeTokens(userId: string, tokens: TokenData): Promise<void> {
    if (!userId) throw new Error('User ID is required');
    
    switch (this.storageMode) {
      case 'ssm':
        await this.storeInSSM(userId, tokens);
        break;
      case 'secrets-manager':
        await this.storeInSecretsManager(userId, tokens);
        break;
      default:
        await this.storeLocally(userId, tokens);
    }
  }
  
  /**
   * Retrieve tokens for a user
   */
  async getTokens(userId: string): Promise<TokenData | null> {
    if (!userId) throw new Error('User ID is required');
    
    switch (this.storageMode) {
      case 'ssm':
        return await this.getFromSSM(userId);
      case 'secrets-manager':
        return await this.getFromSecretsManager(userId);
      default:
        return await this.getFromLocal(userId);
    }
  }
  
  /**
   * Delete tokens for a user
   */
  async deleteTokens(userId: string): Promise<void> {
    if (!userId) throw new Error('User ID is required');
    
    switch (this.storageMode) {
      case 'ssm':
        // SSM doesn't have direct delete, overwrite with empty
        await this.storeInSSM(userId, {});
        break;
      case 'secrets-manager':
        // Secrets Manager - mark for deletion
        await this.deleteFromSecretsManager(userId);
        break;
      default:
        await this.deleteFromLocal(userId);
    }
  }
  
  // AWS SSM Parameter Store methods
  private async storeInSSM(userId: string, tokens: TokenData): Promise<void> {
    if (!this.ssmClient) throw new Error('SSM client not initialized');
    
    const parameterName = `/kelly-assistant/tokens/${userId}`;
    const encryptedData = this.encrypt(JSON.stringify(tokens));
    
    await this.ssmClient.send(new PutParameterCommand({
      Name: parameterName,
      Value: JSON.stringify(encryptedData),
      Type: 'SecureString',
      Overwrite: true
    }));
  }
  
  private async getFromSSM(userId: string): Promise<TokenData | null> {
    if (!this.ssmClient) throw new Error('SSM client not initialized');
    
    try {
      const parameterName = `/kelly-assistant/tokens/${userId}`;
      const response = await this.ssmClient.send(new GetParameterCommand({
        Name: parameterName,
        WithDecryption: true
      }));
      
      if (!response.Parameter?.Value) return null;
      
      const encryptedData = JSON.parse(response.Parameter.Value);
      const decrypted = this.decrypt(
        encryptedData.encrypted,
        encryptedData.iv,
        encryptedData.authTag
      );
      
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('Error retrieving from SSM:', error);
      return null;
    }
  }
  
  // AWS Secrets Manager methods
  private async storeInSecretsManager(userId: string, tokens: TokenData): Promise<void> {
    if (!this.secretsClient) throw new Error('Secrets Manager client not initialized');
    
    const secretName = `kelly-assistant/tokens/${userId}`;
    const encryptedData = this.encrypt(JSON.stringify(tokens));
    
    try {
      await this.secretsClient.send(new PutSecretValueCommand({
        SecretId: secretName,
        SecretString: JSON.stringify(encryptedData)
      }));
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        // Create new secret
        await this.secretsClient.send(new PutSecretValueCommand({
          SecretId: secretName,
          SecretString: JSON.stringify(encryptedData)
        }));
      } else {
        throw error;
      }
    }
  }
  
  private async getFromSecretsManager(userId: string): Promise<TokenData | null> {
    if (!this.secretsClient) throw new Error('Secrets Manager client not initialized');
    
    try {
      const secretName = `kelly-assistant/tokens/${userId}`;
      const response = await this.secretsClient.send(new GetSecretValueCommand({
        SecretId: secretName
      }));
      
      if (!response.SecretString) return null;
      
      const encryptedData = JSON.parse(response.SecretString);
      const decrypted = this.decrypt(
        encryptedData.encrypted,
        encryptedData.iv,
        encryptedData.authTag
      );
      
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('Error retrieving from Secrets Manager:', error);
      return null;
    }
  }
  
  private async deleteFromSecretsManager(userId: string): Promise<void> {
    if (!this.secretsClient) throw new Error('Secrets Manager client not initialized');
    
    // In production, you'd schedule deletion
    // For now, we'll overwrite with empty tokens
    await this.storeInSecretsManager(userId, {});
  }
  
  // Local encrypted file storage methods (fallback)
  private async storeLocally(userId: string, tokens: TokenData): Promise<void> {
    let userTokens: UserTokens = {};
    
    try {
      const existing = await fs.readFile(this.tokenFilePath, 'utf-8');
      userTokens = JSON.parse(existing);
    } catch (error) {
      // File doesn't exist yet
    }
    
    const encryptedData = this.encrypt(JSON.stringify(tokens));
    userTokens[userId] = {
      tokens: encryptedData as any,
      encryptedAt: new Date().toISOString()
    };
    
    await fs.writeFile(
      this.tokenFilePath,
      JSON.stringify(userTokens, null, 2),
      { mode: 0o600 }
    );
  }
  
  private async getFromLocal(userId: string): Promise<TokenData | null> {
    try {
      const data = await fs.readFile(this.tokenFilePath, 'utf-8');
      const userTokens: UserTokens = JSON.parse(data);
      
      if (!userTokens[userId]) return null;
      
      const encryptedData = userTokens[userId].tokens as any;
      const decrypted = this.decrypt(
        encryptedData.encrypted,
        encryptedData.iv,
        encryptedData.authTag
      );
      
      return JSON.parse(decrypted);
    } catch (error) {
      return null;
    }
  }
  
  private async deleteFromLocal(userId: string): Promise<void> {
    try {
      const data = await fs.readFile(this.tokenFilePath, 'utf-8');
      const userTokens: UserTokens = JSON.parse(data);
      
      delete userTokens[userId];
      
      await fs.writeFile(
        this.tokenFilePath,
        JSON.stringify(userTokens, null, 2),
        { mode: 0o600 }
      );
    } catch (error) {
      // File doesn't exist or user not found
    }
  }
  
  /**
   * Generate a secure random state for OAuth
   */
  generateState(): string {
    return crypto.randomBytes(32).toString('hex');
  }
  
  /**
   * Generate PKCE challenge
   */
  generatePKCE(): { verifier: string; challenge: string } {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');
    
    return { verifier, challenge };
  }
}