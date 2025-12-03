import { exec } from 'child_process';
import { promisify } from 'util';
import winston from 'winston';

const execAsync = promisify(exec);

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

export class UserConfirmation {
  private autoApproveMode: boolean;
  
  constructor() {
    // Allow auto-approve via environment variable for unattended operation
    this.autoApproveMode = process.env.AUTO_APPROVE_CONFIRMATION === 'true';
    
    if (this.autoApproveMode) {
      logger.warn('Auto-approve mode enabled for confirmations');
    }
  }
  
  async requestConfirmation(
    type: string,
    action: string,
    data: any
  ): Promise<boolean> {
    const message = this.formatConfirmationMessage(type, action, data);
    
    // Auto-approve if configured
    if (this.autoApproveMode) {
      logger.info(`Auto-approving: ${message}`);
      return true;
    }
    
    // Try platform-specific confirmation
    const platform = process.platform;
    
    try {
      switch (platform) {
        case 'darwin':
          return await this.macOSConfirmation(message);
        case 'win32':
          return await this.windowsConfirmation(message);
        case 'linux':
          return await this.linuxConfirmation(message);
        default:
          logger.warn(`Unsupported platform for confirmation: ${platform}`);
          return await this.fallbackConfirmation(message);
      }
    } catch (error) {
      logger.error('Error showing confirmation dialog:', error);
      return false;
    }
  }
  
  private formatConfirmationMessage(type: string, action: string, data: any): string {
    let message = `Kelly Assistant needs your permission:\n\n`;
    message += `Action: ${type}.${action}\n`;
    
    // Add specific details based on action type
    if (type === 'woolworths' && action === 'checkout') {
      message += `Total: $${data.total || 'unknown'}\n`;
      message += `Delivery: ${data.deliverySlot || 'next available'}\n`;
    } else if (type === 'woolworths' && action === 'addToCart') {
      message += `Product: ${data.productName || data.productId}\n`;
      message += `Quantity: ${data.quantity || 1}\n`;
    }
    
    message += `\nDo you want to proceed?`;
    return message;
  }
  
  private async macOSConfirmation(message: string): Promise<boolean> {
    const script = `
      tell application "System Events"
        display dialog "${message.replace(/"/g, '\\"')}" ¬
          with title "Kelly Assistant Confirmation" ¬
          buttons {"Cancel", "Approve"} ¬
          default button "Cancel" ¬
          with icon caution
      end tell
    `.trim();
    
    try {
      const { stdout } = await execAsync(`osascript -e '${script}'`);
      return stdout.includes('Approve');
    } catch (error: any) {
      // User clicked Cancel or dialog was dismissed
      if (error.code === 1) {
        return false;
      }
      throw error;
    }
  }
  
  private async windowsConfirmation(message: string): Promise<boolean> {
    // Use PowerShell for Windows confirmation dialog
    const script = `
      Add-Type -AssemblyName PresentationFramework
      $result = [System.Windows.MessageBox]::Show(
        "${message.replace(/"/g, '`"')}", 
        "Kelly Assistant Confirmation",
        [System.Windows.MessageBoxButton]::YesNo,
        [System.Windows.MessageBoxImage]::Warning
      )
      if ($result -eq 'Yes') { exit 0 } else { exit 1 }
    `.replace(/\n/g, ';');
    
    try {
      await execAsync(`powershell -Command "${script}"`);
      return true;
    } catch (error: any) {
      return false;
    }
  }
  
  private async linuxConfirmation(message: string): Promise<boolean> {
    // Try zenity first, then fall back to kdialog or xmessage
    const tools = ['zenity', 'kdialog', 'xmessage'];
    
    for (const tool of tools) {
      try {
        await execAsync(`which ${tool}`);
        
        let command: string;
        switch (tool) {
          case 'zenity':
            command = `zenity --question --title="Kelly Assistant" --text="${message}"`;
            break;
          case 'kdialog':
            command = `kdialog --title "Kelly Assistant" --yesno "${message}"`;
            break;
          case 'xmessage':
            command = `xmessage -center -buttons Yes:0,No:1 "${message}"`;
            break;
          default:
            continue;
        }
        
        try {
          await execAsync(command);
          return true;
        } catch (error: any) {
          return false;
        }
      } catch {
        // Tool not found, try next
        continue;
      }
    }
    
    // No GUI tool found
    return await this.fallbackConfirmation(message);
  }
  
  private async fallbackConfirmation(message: string): Promise<boolean> {
    // Log the request and default to deny for safety
    logger.warn('No confirmation dialog available, defaulting to deny');
    logger.info(`Confirmation requested: ${message}`);
    
    // In production, sensitive operations should be denied if we can't confirm
    return false;
  }
  
  // Check if confirmation is required for a specific action
  requiresConfirmation(type: string, action: string): boolean {
    const sensitiveActions = [
      'woolworths.checkout',
      'woolworths.confirmOrder',
      'system.deleteData',
      'system.restart',
      'browser.submitForm',
      'browser.makePayment'
    ];
    
    return sensitiveActions.includes(`${type}.${action}`);
  }
}