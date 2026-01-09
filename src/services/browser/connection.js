/**
 * 浏览器连接模块（带Cookie管理、登录检测、错误恢复和资源优化）
 */

import puppeteer from 'puppeteer';
import { logger } from '../../utils/logger.js';
import { webConfigService } from '../webConfig.js';
import { cookieManager } from '../cookieManager.js';
import { errorHandler, ErrorTypes, ErrorSeverity } from '../../utils/errorHandler.js';
import browserPool from './pool.js';

export class BrowserConnection {
  constructor() {
    this.browser = null;
    this.page = null;
    this.instanceId = null;
    this.isConnected = false;
    this.defaultSite = process.env.DEFAULT_SITE || null;
    this.loginCheckInterval = null;
    this.lastLoginStatus = null;
    this.resourceOptimization = true;
    this.memoryCheckInterval = null;
  }

  /**
   * @param {string} site
   */
  setDefaultSite(site) {
    this.defaultSite = site;
  }

  async initialize() {
    if (this.isConnected) {
      return;
    }

    return await errorHandler.executeWithRetry(async () => {
      try {
        // 注册错误恢复回调
        this.registerRecoveryCallbacks();

        // 初始化cookie管理器
        await cookieManager.init();

        // 从浏览器池获取实例
        const instance = await browserPool.acquire();
        this.instanceId = instance.id;
        this.browser = instance.browser;

        // 监听浏览器断开事件
        this.browser.on('disconnected', () => {
          logger.warn('🔌 浏览器连接断开');
          this.handleBrowserDisconnect();
        });

        // 获取或创建页面
        const pages = await this.browser.pages();
        this.page = pages[0] || await this.browser.newPage();

        // 应用资源优化
        if (this.resourceOptimization) {
          await this.applyResourceOptimization();
        }

        // 监听页面错误
        this.page.on('error', (/** @type {Error} */ error) => {
          errorHandler.logError(error, ErrorTypes.PAGE_LOAD, ErrorSeverity.HIGH);
        });

        // 监听页面崩溃
        this.page.on('pageerror', (/** @type {Error} */ error) => {
          logger.warn(`[PAGE] 页面脚本错误: ${error.message}`);
        });

        this.isConnected = true;
        logger.info('✅ 浏览器连接成功');

        // 自动打开默认网站
        if (this.defaultSite) {
          await this.openDefaultSite();
          // 启动登录状态监听
          this.startLoginMonitor();
          // 启动内存监控
          this.startMemoryMonitor();
        }
      } catch (error) {
        logger.error(`❌ 浏览器连接失败: ${/** @type {Error} */ (error).message}`);
        throw new Error(`无法连接到浏览器`);
      }
    }, ErrorTypes.BROWSER_CONNECTION);
  }

  /**
   * 注册错误恢复回调
   */
  registerRecoveryCallbacks() {
    // 浏览器断连恢复
    errorHandler.registerRecoveryCallback(
      ErrorTypes.BROWSER_DISCONNECTED,
      async () => {
        logger.info('[RECOVERY] 尝试重新连接浏览器...');
        this.isConnected = false;
        this.browser = null;
        this.page = null;
        await this.delay(2000);
        await this.initialize();
      }
    );

    // 页面加载失败恢复
    errorHandler.registerRecoveryCallback(
      ErrorTypes.PAGE_LOAD,
      async (/** @type {Error} */ error, /** @type {any} */ context) => {
        logger.info('[RECOVERY] 尝试重新加载页面...');
        if (this.page) {
          await this.page.reload({ waitUntil: 'networkidle2' });
        }
      }
    );
  }

  /**
   * 应用资源优化
   */
  async applyResourceOptimization() {
    try {
      // 设置合理的视口大小
      await this.page.setViewport({
        width: 1280,
        height: 800,
        deviceScaleFactor: 1
      });

      // 禁用不必要的资源加载（可选）
      const blockResourceTypes = process.env.BLOCK_RESOURCES === 'true';
      
      if (blockResourceTypes) {
        await this.page.setRequestInterception(true);
        
        this.page.on('request', (/** @type {any} */ request) => {
          const resourceType = request.resourceType();
          const blockedTypes = ['image', 'stylesheet', 'font', 'media'];
          
          if (blockedTypes.includes(resourceType)) {
            request.abort();
          } else {
            request.continue();
          }
        });
        
        logger.info('[OPTIMIZATION] 已启用资源阻止（图片、样式、字体、媒体）');
      }

      // 设置缓存策略
      await this.page.setCacheEnabled(true);

      // 设置用户代理（模拟真实浏览器）
      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      logger.info('[OPTIMIZATION] 资源优化已应用');
    } catch (error) {
      logger.warn(`[OPTIMIZATION] 应用资源优化失败: ${/** @type {Error} */ (error).message}`);
    }
  }

  /**
   * 启动内存监控
   */
  startMemoryMonitor() {
    if (this.memoryCheckInterval) {
      return;
    }

    logger.info('[MEMORY] 启动内存监控');

    this.memoryCheckInterval = setInterval(async () => {
      try {
        const metrics = await this.page.metrics();
        const memoryUsage = process.memoryUsage();

        logger.debug(
          `[MEMORY] Heap: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB, ` +
          `RSS: ${(memoryUsage.rss / 1024 / 1024).toFixed(2)}MB, ` +
          `JSHeap: ${(metrics.JSHeapUsedSize / 1024 / 1024).toFixed(2)}MB`
        );

        // 如果内存使用过高，触发清理
        const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
        if (heapUsedMB > 500) { // 500MB 阈值
          logger.warn(`[MEMORY] 内存使用过高 (${heapUsedMB.toFixed(2)}MB)，触发清理`);
          await this.cleanupMemory();
        }
      } catch (error) {
        logger.error(`[MEMORY] 内存监控错误: ${/** @type {Error} */ (error).message}`);
      }
    }, 60000); // 每分钟检查一次
  }

  /**
   * 停止内存监控
   */
  stopMemoryMonitor() {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = null;
      logger.info('[MEMORY] 内存监控已停止');
    }
  }

  /**
   * 清理内存
   */
  async cleanupMemory() {
    try {
      logger.info('[MEMORY] 开始清理内存...');

      // 清理页面缓存
      if (this.page) {
        const client = await this.page.target().createCDPSession();
        await client.send('Network.clearBrowserCache');
        await client.send('Network.clearBrowserCookies');
        logger.debug('[MEMORY] 已清理浏览器缓存');
      }

      // 触发垃圾回收（如果可用）
      if (global.gc) {
        global.gc();
        logger.debug('[MEMORY] 已触发垃圾回收');
      }

      logger.info('[MEMORY] 内存清理完成');
    } catch (error) {
      logger.error(`[MEMORY] 内存清理失败: ${/** @type {Error} */ (error).message}`);
    }
  }

  /**
   * 处理浏览器断开连接
   */
  async handleBrowserDisconnect() {
    this.isConnected = false;
    this.stopLoginMonitor();
    this.stopMemoryMonitor();

    errorHandler.logError(
      new Error('Browser disconnected'),
      ErrorTypes.BROWSER_DISCONNECTED,
      ErrorSeverity.CRITICAL
    );

    // 尝试自动恢复
    const recovered = await errorHandler.attemptRecovery(
      new Error('Browser disconnected'),
      ErrorTypes.BROWSER_DISCONNECTED
    );

    if (!recovered) {
      logger.error('❌ 浏览器断连后无法自动恢复，请重启服务');
    }
  }

  async openDefaultSite() {
    return await errorHandler.executeWithRetry(async () => {
      try {
        const url = this.page.url();

        // 检查当前URL是否为目标网站
        if (url.includes(this.defaultSite)) {
          logger.info(`📍 已在目标网站: ${this.defaultSite}`);
          await this.loadCookies();
          await this.checkAndWaitForLogin();
          return;
        }

        // 获取站点配置
        const siteConfig = this.defaultSite ? webConfigService.getSiteConfig(this.defaultSite) : null;
        if (!siteConfig) {
          logger.warn(`⚠️ 未找到站点配置: ${this.defaultSite}`);
          return;
        }

        // 构建目标URL
        const targetUrl = siteConfig.url || `https://${this.defaultSite}`;

        logger.info(`🌐 正在打开目标网站: ${targetUrl}`);

        // 先尝试加载cookies
        await this.loadCookies();

        // 打开网站（带超时）
        await this.page.goto(targetUrl, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });

        logger.info(`✅ 网站已打开: ${targetUrl}`);

        // 等待页面加载完成
        await this.page.waitForTimeout(2000);

        // 检查登录状态并等待登录
        await this.checkAndWaitForLogin();

      } catch (error) {
        errorHandler.logError(error, ErrorTypes.PAGE_LOAD, ErrorSeverity.HIGH, {
          site: this.defaultSite
        });
        throw error;
      }
    }, ErrorTypes.PAGE_LOAD, { site: this.defaultSite });
  }

  /**
   * 检查登录状态并等待用户登录
   */
  async checkAndWaitForLogin() {
    try {
      const isLoggedIn = await this.detectLoginStatus();
      
      if (isLoggedIn) {
        logger.info('✅ 检测到已登录状态');
        await this.saveCookies();
        return true;
      }

      logger.warn('⚠️ 未检测到登录状态，等待用户登录...');
      logger.info('💡 请在浏览器中手动登录网站');

      // 轮询检查登录状态（最多等待5分钟）
      const maxWaitTime = 5 * 60 * 1000; // 5分钟
      const checkInterval = 3000; // 每3秒检查一次
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        await this.delay(checkInterval);
        
        const nowLoggedIn = await this.detectLoginStatus();
        if (nowLoggedIn) {
          logger.info('🎉 检测到登录成功！');
          await this.saveCookies();
          return true;
        }
      }

      logger.warn('⏰ 等待登录超时，将继续运行但功能可能受限');
      return false;

    } catch (error) {
      logger.error(`登录状态检查失败: ${/** @type {Error} */ (error).message}`);
      return false;
    }
  }

  /**
   * 检测登录状态
   */
  async detectLoginStatus() {
    try {
      const url = this.page.url();
      const domain = this.extractDomain(url);

      // 方法1: 检查关键Cookie
      const cookies = await this.page.cookies();
      const hasAuthCookie = cookies.some((/** @type {any} */ cookie) => {
        const name = cookie.name.toLowerCase();
        return name.includes('token') || 
               name.includes('auth') || 
               name.includes('session') ||
               name.includes('_secure') ||
               name.includes('credential');
      });

      // 方法2: 检查页面特征元素
      const loginElements = await this.page.evaluate(() => {
        const loginSelectors = [
          '[data-testid*="login"]',
          '[aria-label*="login" i]',
          '[aria-label*="sign in" i]',
          'button:has-text("登录")',
          'button:has-text("Sign in")',
          'button:has-text("Log in")',
          'a[href*="login"]',
          'a[href*="signin"]'
        ];

        const userSelectors = [
          '[data-testid*="user"]',
          '[aria-label*="user" i]',
          '[aria-label*="account" i]',
          '[class*="avatar"]',
          '[class*="profile"]',
          'button:has-text("账号")',
          'button:has-text("Profile")',
          'button:has-text("Account")'
        ];

        const hasLoginButton = loginSelectors.some(sel => {
          try {
            return document.querySelector(sel) !== null;
          } catch {
            return false;
          }
        });

        const hasUserElement = userSelectors.some(sel => {
          try {
            return document.querySelector(sel) !== null;
          } catch {
            return false;
          }
        });

        return { hasLoginButton, hasUserElement };
      });

      // 方法3: 检查URL
      const isLoginPage = url.toLowerCase().includes('login') || 
                         url.toLowerCase().includes('signin') ||
                         url.toLowerCase().includes('auth');

      // 综合判断
      const isLoggedIn = hasAuthCookie && 
                        !loginElements.hasLoginButton && 
                        loginElements.hasUserElement &&
                        !isLoginPage;

      logger.debug(`[LOGIN_CHECK] domain=${domain}, cookies=${hasAuthCookie}, no_login_btn=${!loginElements.hasLoginButton}, has_user=${loginElements.hasUserElement}, not_login_page=${!isLoginPage} => ${isLoggedIn ? '已登录' : '未登录'}`);

      return isLoggedIn;

    } catch (error) {
      logger.error(`登录检测失败: ${/** @type {Error} */ (error).message}`);
      return false;
    }
  }

  /**
   * 启动登录状态监听器
   */
  startLoginMonitor() {
    if (this.loginCheckInterval) {
      return;
    }

    logger.info('🔄 启动登录状态监听器');

    this.loginCheckInterval = setInterval(async () => {
      try {
        const isLoggedIn = await this.detectLoginStatus();
        
        // 登录状态发生变化
        if (this.lastLoginStatus !== null && this.lastLoginStatus !== isLoggedIn) {
          if (isLoggedIn) {
            logger.info('🔔 检测到登录状态变化：未登录 -> 已登录');
            await this.saveCookies();
          } else {
            logger.warn('🔔 检测到登录状态变化：已登录 -> 未登录');
          }
        }

        this.lastLoginStatus = isLoggedIn;

        // 如果已登录，定期刷新cookies
        if (isLoggedIn) {
          await this.saveCookies();
        }

      } catch (error) {
        logger.error(`登录监听器错误: ${/** @type {Error} */ (error).message}`);
      }
    }, 30000); // 每30秒检查一次
  }

  /**
   * 停止登录状态监听器
   */
  stopLoginMonitor() {
    if (this.loginCheckInterval) {
      clearInterval(this.loginCheckInterval);
      this.loginCheckInterval = null;
      logger.info('⏹️ 登录状态监听器已停止');
    }
  }

  async saveCookies() {
    try {
      const url = this.page.url();
      const domain = this.extractDomain(url);

      const cookies = await this.page.cookies();

      if (cookies.length > 0) {
        await cookieManager.saveCookies(domain, cookies);
        logger.debug(`[COOKIE] 💾 已保存 ${cookies.length} 个cookies到: ${domain}.json`);
      } else {
        logger.debug(`[COOKIE] ⚠️ 未检测到cookies`);
      }
    } catch (error) {
      errorHandler.logError(error, ErrorTypes.COOKIE_SAVE, ErrorSeverity.MEDIUM);
    }
  }

  async loadCookies() {
    return await errorHandler.executeWithRetry(async () => {
      try {
        const url = this.page.url();
        const domain = this.extractDomain(url);

        const cookies = await cookieManager.loadCookies(domain);

        if (cookies && cookies.length > 0) {
          await this.page.setCookie(...cookies);
          logger.info(`[COOKIE] 📥 已加载 ${cookies.length} 个cookies从: ${domain}.json`);
          return true;
        }

        logger.debug(`[COOKIE] 📭 未找到本地cookies: ${domain}.json`);
        return false;
      } catch (error) {
        errorHandler.logError(error, ErrorTypes.COOKIE_LOAD, ErrorSeverity.MEDIUM);
        return false;
      }
    }, ErrorTypes.COOKIE_LOAD);
  }

  /**
   * 从URL提取域名
   * @param {string} url
   */
  extractDomain(url) {
    try {
      return url.split('//')[1]?.split('/')[0] || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  async healthCheck() {
    try {
      if (!this.browser) {
        await this.initialize();
      }

      const url = this.page ? this.page.url() : '';
      const title = this.page ? await this.page.title() : '';
      const isLoggedIn = await this.detectLoginStatus();

      return {
        status: 'healthy',
        connected: true,
        url,
        title,
        isLoggedIn,
        error: null
      };
    } catch (error) {
      this.isConnected = false;
      return {
        status: 'unhealthy',
        connected: false,
        url: null,
        title: null,
        isLoggedIn: false,
        error: /** @type {Error} */ (error).message
      };
    }
  }

  getPage() {
    if (!this.isConnected || !this.page) {
      throw new Error('浏览器未连接');
    }
    return this.page;
  }

  async close() {
    logger.info('关闭浏览器连接');

    // 停止登录监听器
    this.stopLoginMonitor();
    this.stopMemoryMonitor();

    // 释放浏览器池实例
    if (this.instanceId) {
      browserPool.release(this.instanceId);
      this.instanceId = null;
    }

    this.browser = null;
    this.page = null;
    this.isConnected = false;
  }

  /**
   * @param {number} ms
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}