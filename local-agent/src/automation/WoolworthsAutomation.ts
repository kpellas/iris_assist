import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { CredentialManager } from '../utils/CredentialManager';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

export interface Product {
  id: string;
  name: string;
  price: number;
  quantity?: number;
  imageUrl?: string;
}

export interface CartItem extends Product {
  quantity: number;
  subtotal: number;
}

export class WoolworthsAutomation {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private credentialManager: CredentialManager;
  private isLoggedIn: boolean = false;
  
  constructor(credentialManager: CredentialManager) {
    this.credentialManager = credentialManager;
  }
  
  private async initialize() {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: process.env.NODE_ENV === 'production',
        args: ['--disable-blink-features=AutomationControlled']
      });
      
      this.context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });
      
      this.page = await this.context.newPage();
      
      // Add stealth measures
      await this.page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false
        });
      });
    }
  }
  
  async login(): Promise<boolean> {
    try {
      await this.initialize();
      
      if (!this.page) throw new Error('Page not initialized');
      
      // Get credentials securely from keychain
      const credentials = await this.credentialManager.getCredentials('woolworths');
      
      if (!credentials) {
        throw new Error('Woolworths credentials not found. Please set them up first.');
      }
      
      logger.info('Navigating to Woolworths...');
      await this.page.goto('https://www.woolworths.com.au');
      
      // Click login button
      await this.page.click('button:has-text("Log in / Sign up")');
      await this.page.waitForSelector('input[name="email"]', { timeout: 10000 });
      
      // Enter credentials
      await this.page.fill('input[name="email"]', credentials.username);
      await this.page.fill('input[name="password"]', credentials.password);
      
      // Submit login
      await this.page.click('button[type="submit"]:has-text("Log in")');
      
      // Wait for login to complete
      await this.page.waitForSelector('[data-testid="user-menu"]', { timeout: 15000 });
      
      this.isLoggedIn = true;
      logger.info('Successfully logged in to Woolworths');
      
      return true;
    } catch (error) {
      logger.error('Login failed:', error);
      throw error;
    }
  }
  
  async prepareStandardCart(items: string[]): Promise<CartItem[]> {
    try {
      if (!this.isLoggedIn) {
        await this.login();
      }
      
      if (!this.page) throw new Error('Page not initialized');
      
      const cart: CartItem[] = [];
      
      // Clear existing cart
      await this.clearCart();
      
      // Add standard items
      for (const item of items) {
        const product = await this.searchAndAddProduct(item);
        if (product) {
          cart.push(product);
        }
      }
      
      logger.info(`Cart prepared with ${cart.length} items`);
      return cart;
    } catch (error) {
      logger.error('Failed to prepare cart:', error);
      throw error;
    }
  }
  
  private async searchAndAddProduct(query: string): Promise<CartItem | null> {
    try {
      if (!this.page) throw new Error('Page not initialized');
      
      // Search for product
      await this.page.fill('input[placeholder="Search products"]', query);
      await this.page.press('input[placeholder="Search products"]', 'Enter');
      
      // Wait for search results
      await this.page.waitForSelector('[data-testid="product-grid"]', { timeout: 10000 });
      
      // Click first result
      const firstProduct = await this.page.$('[data-testid="product-tile"]:first-child');
      if (!firstProduct) {
        logger.warn(`No product found for: ${query}`);
        return null;
      }
      
      // Extract product info
      const productInfo = await firstProduct.evaluate((el) => {
        const name = el.querySelector('[data-testid="product-title"]')?.textContent || '';
        const price = el.querySelector('[data-testid="price"]')?.textContent || '';
        const id = el.getAttribute('data-product-id') || '';
        return { name, price, id };
      });
      
      // Add to cart
      await firstProduct.click('[data-testid="add-to-cart"]');
      
      // Wait for cart update
      await this.page.waitForTimeout(1000);
      
      return {
        id: productInfo.id,
        name: productInfo.name,
        price: parseFloat(productInfo.price.replace(/[^0-9.]/g, '')),
        quantity: 1,
        subtotal: parseFloat(productInfo.price.replace(/[^0-9.]/g, ''))
      };
    } catch (error) {
      logger.error(`Failed to add product ${query}:`, error);
      return null;
    }
  }
  
  async addToCart(productId: string, quantity: number = 1): Promise<boolean> {
    try {
      if (!this.isLoggedIn) {
        await this.login();
      }
      
      if (!this.page) throw new Error('Page not initialized');
      
      // Navigate to product page
      await this.page.goto(`https://www.woolworths.com.au/shop/productdetails/${productId}`);
      
      // Set quantity
      if (quantity > 1) {
        await this.page.fill('input[data-testid="quantity-input"]', quantity.toString());
      }
      
      // Add to cart
      await this.page.click('button[data-testid="add-to-cart"]');
      
      // Wait for confirmation
      await this.page.waitForSelector('[data-testid="added-to-cart-notification"]', { timeout: 5000 });
      
      logger.info(`Added ${quantity}x product ${productId} to cart`);
      return true;
    } catch (error) {
      logger.error('Failed to add to cart:', error);
      throw error;
    }
  }
  
  async removeFromCart(productId: string): Promise<boolean> {
    try {
      if (!this.isLoggedIn) {
        await this.login();
      }
      
      if (!this.page) throw new Error('Page not initialized');
      
      // Go to cart
      await this.page.goto('https://www.woolworths.com.au/shop/cart');
      
      // Find and remove item
      const item = await this.page.$(`[data-product-id="${productId}"]`);
      if (item) {
        await item.click('[data-testid="remove-item"]');
        await this.page.waitForTimeout(1000);
        logger.info(`Removed product ${productId} from cart`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Failed to remove from cart:', error);
      throw error;
    }
  }
  
  async getCart(): Promise<CartItem[]> {
    try {
      if (!this.isLoggedIn) {
        await this.login();
      }
      
      if (!this.page) throw new Error('Page not initialized');
      
      // Navigate to cart
      await this.page.goto('https://www.woolworths.com.au/shop/cart');
      await this.page.waitForSelector('[data-testid="cart-item"]', { timeout: 10000 });
      
      // Extract cart items
      const items = await this.page.$$eval('[data-testid="cart-item"]', (elements) => {
        return elements.map(el => ({
          id: el.getAttribute('data-product-id') || '',
          name: el.querySelector('[data-testid="product-name"]')?.textContent || '',
          price: parseFloat(
            el.querySelector('[data-testid="product-price"]')?.textContent?.replace(/[^0-9.]/g, '') || '0'
          ),
          quantity: parseInt(
            el.querySelector('[data-testid="quantity-input"]')?.getAttribute('value') || '1'
          ),
          subtotal: parseFloat(
            el.querySelector('[data-testid="subtotal"]')?.textContent?.replace(/[^0-9.]/g, '') || '0'
          )
        }));
      });
      
      logger.info(`Cart contains ${items.length} items`);
      return items;
    } catch (error) {
      logger.error('Failed to get cart:', error);
      throw error;
    }
  }
  
  async clearCart(): Promise<boolean> {
    try {
      if (!this.isLoggedIn) {
        await this.login();
      }
      
      if (!this.page) throw new Error('Page not initialized');
      
      // Go to cart
      await this.page.goto('https://www.woolworths.com.au/shop/cart');
      
      // Check if cart is empty
      const emptyCart = await this.page.$('[data-testid="empty-cart"]');
      if (emptyCart) {
        logger.info('Cart is already empty');
        return true;
      }
      
      // Remove all items
      const removeButtons = await this.page.$$('[data-testid="remove-item"]');
      for (const button of removeButtons) {
        await button.click();
        await this.page.waitForTimeout(500);
      }
      
      logger.info('Cart cleared');
      return true;
    } catch (error) {
      logger.error('Failed to clear cart:', error);
      throw error;
    }
  }
  
  async searchProduct(query: string): Promise<Product[]> {
    try {
      if (!this.isLoggedIn) {
        await this.login();
      }
      
      if (!this.page) throw new Error('Page not initialized');
      
      // Search for products
      await this.page.goto(`https://www.woolworths.com.au/shop/search/products?searchTerm=${encodeURIComponent(query)}`);
      await this.page.waitForSelector('[data-testid="product-grid"]', { timeout: 10000 });
      
      // Extract product data
      const products = await this.page.$$eval('[data-testid="product-tile"]', (elements) => {
        return elements.slice(0, 10).map(el => ({
          id: el.getAttribute('data-product-id') || '',
          name: el.querySelector('[data-testid="product-title"]')?.textContent || '',
          price: parseFloat(
            el.querySelector('[data-testid="price"]')?.textContent?.replace(/[^0-9.]/g, '') || '0'
          ),
          imageUrl: el.querySelector('img')?.getAttribute('src') || ''
        }));
      });
      
      logger.info(`Found ${products.length} products for query: ${query}`);
      return products;
    } catch (error) {
      logger.error('Search failed:', error);
      throw error;
    }
  }
  
  async checkout(options: {
    deliverySlot?: string;
    paymentMethod?: string;
    saveOrder?: boolean;
  } = {}): Promise<any> {
    try {
      if (!this.isLoggedIn) {
        await this.login();
      }
      
      if (!this.page) throw new Error('Page not initialized');
      
      // This is a sensitive operation - log but don't auto-complete
      logger.info('Checkout requested with options:', options);
      
      // Navigate to checkout
      await this.page.goto('https://www.woolworths.com.au/shop/checkout');
      
      // In production, this would:
      // 1. Select delivery slot
      // 2. Confirm payment method
      // 3. Review order
      // 4. Place order (with additional confirmation)
      
      // For safety, we don't auto-complete checkout
      return {
        status: 'checkout_prepared',
        message: 'Checkout page loaded. Manual confirmation required.',
        cartTotal: await this.getCartTotal()
      };
    } catch (error) {
      logger.error('Checkout failed:', error);
      throw error;
    }
  }
  
  private async getCartTotal(): Promise<number> {
    try {
      if (!this.page) throw new Error('Page not initialized');
      
      const totalText = await this.page.$eval(
        '[data-testid="cart-total"]',
        el => el.textContent || '0'
      );
      
      return parseFloat(totalText.replace(/[^0-9.]/g, ''));
    } catch (error) {
      return 0;
    }
  }
  
  async getOrderHistory(): Promise<any[]> {
    try {
      if (!this.isLoggedIn) {
        await this.login();
      }
      
      if (!this.page) throw new Error('Page not initialized');
      
      // Navigate to orders
      await this.page.goto('https://www.woolworths.com.au/shop/myaccount/myorders');
      await this.page.waitForSelector('[data-testid="order-card"]', { timeout: 10000 });
      
      // Extract order data
      const orders = await this.page.$$eval('[data-testid="order-card"]', (elements) => {
        return elements.slice(0, 5).map(el => ({
          orderId: el.querySelector('[data-testid="order-number"]')?.textContent || '',
          date: el.querySelector('[data-testid="order-date"]')?.textContent || '',
          total: el.querySelector('[data-testid="order-total"]')?.textContent || '',
          status: el.querySelector('[data-testid="order-status"]')?.textContent || ''
        }));
      });
      
      logger.info(`Retrieved ${orders.length} recent orders`);
      return orders;
    } catch (error) {
      logger.error('Failed to get order history:', error);
      throw error;
    }
  }
  
  async cleanup() {
    if (this.page) {
      await this.page.close();
    }
    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
    
    this.page = null;
    this.context = null;
    this.browser = null;
    this.isLoggedIn = false;
  }
}