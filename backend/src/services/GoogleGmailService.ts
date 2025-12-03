import { gmail_v1, google } from 'googleapis';
import { GoogleAuthService } from './GoogleAuthService';

export interface GmailMessage {
  id?: string;
  threadId?: string;
  subject?: string;
  from?: string;
  to?: string;
  date?: string;
  snippet?: string;
  body?: string;
  labels?: string[];
  attachments?: Array<{
    filename: string;
    mimeType: string;
    size: number;
    attachmentId?: string;
  }>;
}

export interface GmailThread {
  id?: string;
  snippet?: string;
  historyId?: string;
  messages?: GmailMessage[];
}

export class GoogleGmailService {
  private gmail: gmail_v1.Gmail;
  private authService: GoogleAuthService;
  
  constructor(authService: GoogleAuthService) {
    this.authService = authService;
    this.gmail = google.gmail({ 
      version: 'v1', 
      auth: authService.getAuthClient() 
    });
  }
  
  /**
   * List messages in inbox
   */
  async listMessages(
    query?: string,
    maxResults: number = 10,
    labelIds: string[] = ['INBOX']
  ): Promise<GmailMessage[]> {
    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults,
        labelIds
      });
      
      if (!response.data.messages) {
        return [];
      }
      
      // Fetch full message details
      const messages = await Promise.all(
        response.data.messages.map(msg => this.getMessage(msg.id!))
      );
      
      return messages;
    } catch (error) {
      console.error('Error listing messages:', error);
      throw error;
    }
  }
  
  /**
   * Get a specific message
   */
  async getMessage(messageId: string): Promise<GmailMessage> {
    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });
      
      const message = response.data;
      const headers = message.payload?.headers || [];
      
      const getHeader = (name: string) => 
        headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
      
      const result: GmailMessage = {
        id: message.id || '',
        threadId: message.threadId || '',
        subject: getHeader('subject'),
        from: getHeader('from'),
        to: getHeader('to'),
        date: getHeader('date'),
        snippet: message.snippet || '',
        labels: message.labelIds || [],
        body: this.extractBody(message.payload),
        attachments: this.extractAttachments(message.payload)
      };
      
      return result;
    } catch (error) {
      console.error('Error getting message:', error);
      throw error;
    }
  }
  
  /**
   * Search emails
   */
  async searchEmails(query: string, maxResults: number = 10): Promise<GmailMessage[]> {
    return this.listMessages(query, maxResults, []);
  }
  
  /**
   * Get unread emails
   */
  async getUnreadEmails(maxResults: number = 10): Promise<GmailMessage[]> {
    return this.listMessages('is:unread', maxResults);
  }
  
  /**
   * Get emails from a specific sender
   */
  async getEmailsFromSender(sender: string, maxResults: number = 10): Promise<GmailMessage[]> {
    return this.listMessages(`from:${sender}`, maxResults);
  }
  
  /**
   * Send an email
   */
  async sendEmail(
    to: string,
    subject: string,
    body: string,
    cc?: string,
    bcc?: string
  ): Promise<string> {
    try {
      const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
      const messageParts = [
        `To: ${to}`,
        cc ? `Cc: ${cc}` : null,
        bcc ? `Bcc: ${bcc}` : null,
        `Subject: ${utf8Subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=utf-8',
        '',
        body
      ].filter(Boolean).join('\n');
      
      const encodedMessage = Buffer.from(messageParts)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      
      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage
        }
      });
      
      return response.data.id || '';
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }
  
  /**
   * Reply to an email
   */
  async replyToEmail(
    messageId: string,
    threadId: string,
    body: string
  ): Promise<string> {
    try {
      // Get original message for headers
      const original = await this.getMessage(messageId);
      
      const to = original.from || '';
      const subject = original.subject?.startsWith('Re: ') 
        ? original.subject 
        : `Re: ${original.subject}`;
      
      const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
      const messageParts = [
        `To: ${to}`,
        `Subject: ${utf8Subject}`,
        `In-Reply-To: ${messageId}`,
        `References: ${messageId}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=utf-8',
        '',
        body
      ].join('\n');
      
      const encodedMessage = Buffer.from(messageParts)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      
      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
          threadId
        }
      });
      
      return response.data.id || '';
    } catch (error) {
      console.error('Error replying to email:', error);
      throw error;
    }
  }
  
  /**
   * Mark message as read
   */
  async markAsRead(messageId: string): Promise<void> {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD']
        }
      });
    } catch (error) {
      console.error('Error marking as read:', error);
      throw error;
    }
  }
  
  /**
   * Mark message as unread
   */
  async markAsUnread(messageId: string): Promise<void> {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: ['UNREAD']
        }
      });
    } catch (error) {
      console.error('Error marking as unread:', error);
      throw error;
    }
  }
  
  /**
   * Add label to message
   */
  async addLabel(messageId: string, labelId: string): Promise<void> {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: [labelId]
        }
      });
    } catch (error) {
      console.error('Error adding label:', error);
      throw error;
    }
  }
  
  /**
   * Remove label from message
   */
  async removeLabel(messageId: string, labelId: string): Promise<void> {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: [labelId]
        }
      });
    } catch (error) {
      console.error('Error removing label:', error);
      throw error;
    }
  }
  
  /**
   * Move to trash
   */
  async moveToTrash(messageId: string): Promise<void> {
    try {
      await this.gmail.users.messages.trash({
        userId: 'me',
        id: messageId
      });
    } catch (error) {
      console.error('Error moving to trash:', error);
      throw error;
    }
  }
  
  /**
   * Create a draft
   */
  async createDraft(
    to: string,
    subject: string,
    body: string
  ): Promise<string> {
    try {
      const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
      const messageParts = [
        `To: ${to}`,
        `Subject: ${utf8Subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=utf-8',
        '',
        body
      ].join('\n');
      
      const encodedMessage = Buffer.from(messageParts)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      
      const response = await this.gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
          message: {
            raw: encodedMessage
          }
        }
      });
      
      return response.data.id || '';
    } catch (error) {
      console.error('Error creating draft:', error);
      throw error;
    }
  }
  
  /**
   * Get threads
   */
  async getThreads(query?: string, maxResults: number = 10): Promise<GmailThread[]> {
    try {
      const response = await this.gmail.users.threads.list({
        userId: 'me',
        q: query,
        maxResults
      });
      
      if (!response.data.threads) {
        return [];
      }
      
      const threads = await Promise.all(
        response.data.threads.map(thread => this.getThread(thread.id!))
      );
      
      return threads;
    } catch (error) {
      console.error('Error getting threads:', error);
      throw error;
    }
  }
  
  /**
   * Get a specific thread
   */
  async getThread(threadId: string): Promise<GmailThread> {
    try {
      const response = await this.gmail.users.threads.get({
        userId: 'me',
        id: threadId
      });
      
      const thread = response.data;
      const messages = await Promise.all(
        (thread.messages || []).map(msg => {
          const headers = msg.payload?.headers || [];
          const getHeader = (name: string) => 
            headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
          
          return {
            id: msg.id || '',
            threadId: msg.threadId || '',
            subject: getHeader('subject'),
            from: getHeader('from'),
            to: getHeader('to'),
            date: getHeader('date'),
            snippet: msg.snippet || '',
            body: this.extractBody(msg.payload),
            labels: msg.labelIds || []
          } as GmailMessage;
        })
      );
      
      return {
        id: thread.id || '',
        snippet: thread.snippet || '',
        historyId: thread.historyId || '',
        messages
      };
    } catch (error) {
      console.error('Error getting thread:', error);
      throw error;
    }
  }
  
  /**
   * Extract body from message payload
   */
  private extractBody(payload: any): string {
    if (!payload) return '';
    
    // Check for plain text first
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }
    
    // Check parts for multipart messages
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
        if (part.mimeType === 'text/html' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
        // Recursive check for nested parts
        if (part.parts) {
          const nestedBody = this.extractBody(part);
          if (nestedBody) return nestedBody;
        }
      }
    }
    
    return '';
  }
  
  /**
   * Extract attachments from message
   */
  private extractAttachments(payload: any): any[] {
    const attachments: any[] = [];
    
    if (!payload?.parts) return attachments;
    
    const extractFromParts = (parts: any[]) => {
      for (const part of parts) {
        if (part.filename && part.body?.attachmentId) {
          attachments.push({
            filename: part.filename,
            mimeType: part.mimeType || 'application/octet-stream',
            size: part.body.size || 0,
            attachmentId: part.body.attachmentId
          });
        }
        if (part.parts) {
          extractFromParts(part.parts);
        }
      }
    };
    
    extractFromParts(payload.parts);
    return attachments;
  }
}