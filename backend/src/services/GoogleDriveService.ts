import { google, drive_v3 } from 'googleapis';
import { GoogleAuthService } from './GoogleAuthService';
import stream from 'stream';

export interface DriveFile {
  id?: string;
  name: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  parents?: string[];
}

export class GoogleDriveService {
  private drive: drive_v3.Drive;
  private authService: GoogleAuthService;
  
  constructor(authService: GoogleAuthService) {
    this.authService = authService;
    this.drive = google.drive({ 
      version: 'v3', 
      auth: authService.getAuthClient() 
    });
  }
  
  /**
   * Search files in Drive
   */
  async searchFiles(query: string, limit: number = 10): Promise<DriveFile[]> {
    try {
      // Build search query
      const q = `(name contains '${query}' or fullText contains '${query}') and trashed = false`;
      
      const response = await this.drive.files.list({
        q,
        pageSize: limit,
        fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink)',
        orderBy: 'modifiedTime desc'
      });
      
      return response.data.files?.map(file => ({
        id: file.id || '',
        name: file.name || '',
        mimeType: file.mimeType || '',
        size: file.size || '',
        modifiedTime: file.modifiedTime || '',
        webViewLink: file.webViewLink || ''
      })) || [];
    } catch (error) {
      console.error('Error searching Drive files:', error);
      throw error;
    }
  }
  
  /**
   * Get recent files
   */
  async getRecentFiles(limit: number = 10): Promise<DriveFile[]> {
    try {
      const response = await this.drive.files.list({
        pageSize: limit,
        fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink)',
        orderBy: 'modifiedTime desc',
        q: 'trashed = false'
      });
      
      return response.data.files?.map(file => ({
        id: file.id || '',
        name: file.name || '',
        mimeType: file.mimeType || '',
        size: file.size || '',
        modifiedTime: file.modifiedTime || '',
        webViewLink: file.webViewLink || ''
      })) || [];
    } catch (error) {
      console.error('Error getting recent files:', error);
      throw error;
    }
  }
  
  /**
   * Create a new document
   */
  async createDocument(
    name: string, 
    content: string, 
    mimeType: string = 'text/plain',
    folderId?: string
  ): Promise<DriveFile> {
    try {
      const fileMetadata: any = {
        name,
        mimeType: 'application/vnd.google-apps.document'
      };
      
      if (folderId) {
        fileMetadata.parents = [folderId];
      }
      
      // Convert content to stream
      const bufferStream = new stream.PassThrough();
      bufferStream.end(Buffer.from(content));
      
      const response = await this.drive.files.create({
        requestBody: fileMetadata,
        media: {
          mimeType,
          body: bufferStream
        },
        fields: 'id, name, webViewLink'
      });
      
      return {
        id: response.data.id || '',
        name: response.data.name || '',
        webViewLink: response.data.webViewLink || ''
      };
    } catch (error) {
      console.error('Error creating document:', error);
      throw error;
    }
  }
  
  /**
   * Create a folder
   */
  async createFolder(name: string, parentId?: string): Promise<DriveFile> {
    try {
      const fileMetadata: any = {
        name,
        mimeType: 'application/vnd.google-apps.folder'
      };
      
      if (parentId) {
        fileMetadata.parents = [parentId];
      }
      
      const response = await this.drive.files.create({
        requestBody: fileMetadata,
        fields: 'id, name, webViewLink'
      });
      
      return {
        id: response.data.id || '',
        name: response.data.name || '',
        webViewLink: response.data.webViewLink || ''
      };
    } catch (error) {
      console.error('Error creating folder:', error);
      throw error;
    }
  }
  
  /**
   * Get file content (for text files)
   */
  async getFileContent(fileId: string): Promise<string> {
    try {
      const response = await this.drive.files.get({
        fileId,
        alt: 'media'
      });
      
      return response.data as string;
    } catch (error) {
      console.error('Error getting file content:', error);
      throw error;
    }
  }
  
  /**
   * Update file content
   */
  async updateFileContent(
    fileId: string, 
    content: string, 
    mimeType: string = 'text/plain'
  ): Promise<DriveFile> {
    try {
      const bufferStream = new stream.PassThrough();
      bufferStream.end(Buffer.from(content));
      
      const response = await this.drive.files.update({
        fileId,
        media: {
          mimeType,
          body: bufferStream
        },
        fields: 'id, name, modifiedTime, webViewLink'
      });
      
      return {
        id: response.data.id || '',
        name: response.data.name || '',
        modifiedTime: response.data.modifiedTime || '',
        webViewLink: response.data.webViewLink || ''
      };
    } catch (error) {
      console.error('Error updating file:', error);
      throw error;
    }
  }
  
  /**
   * Share a file
   */
  async shareFile(
    fileId: string, 
    email: string, 
    role: 'reader' | 'writer' = 'reader'
  ): Promise<void> {
    try {
      await this.drive.permissions.create({
        fileId,
        requestBody: {
          type: 'user',
          role,
          emailAddress: email
        }
      });
      
      console.log(`File ${fileId} shared with ${email} as ${role}`);
    } catch (error) {
      console.error('Error sharing file:', error);
      throw error;
    }
  }
  
  /**
   * Move file to trash
   */
  async deleteFile(fileId: string): Promise<void> {
    try {
      await this.drive.files.update({
        fileId,
        requestBody: {
          trashed: true
        }
      });
      
      console.log(`File ${fileId} moved to trash`);
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  }
  
  /**
   * Search for a specific folder
   */
  async findFolder(name: string): Promise<DriveFile | null> {
    try {
      const response = await this.drive.files.list({
        q: `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 1
      });
      
      if (response.data.files && response.data.files.length > 0) {
        return {
          id: response.data.files[0].id || '',
          name: response.data.files[0].name || ''
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error finding folder:', error);
      throw error;
    }
  }
  
  /**
   * Create or get Kelly Assistant folder
   */
  async getOrCreateAssistantFolder(): Promise<string> {
    const folderName = 'Kelly Assistant';
    
    // Check if folder exists
    const existingFolder = await this.findFolder(folderName);
    if (existingFolder && existingFolder.id) {
      return existingFolder.id;
    }
    
    // Create folder
    const newFolder = await this.createFolder(folderName);
    return newFolder.id!;
  }
}