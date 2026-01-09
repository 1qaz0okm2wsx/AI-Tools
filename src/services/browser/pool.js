/**
 * 浏览器实例池管理器
 */

import puppeteer from 'puppeteer';
import { logger } from '../../utils/logger.js';
import configService from '../config/index.js';
import { webConfigService } from '../webConfig.js';

export class BrowserPool {
  constructor() {
    const browserConfig = configService.getBrowserConfig();
    this.maxInstances = browserConfig.pool.maxInstances;
    this.pool = new Map(); // 存储浏览器实例
    this.activeConnections = new Map(); // 存储活跃连接
    this.instanceCounter = 0; // 实例计数器
    this.cleanupInterval = null;
    this.idleTimeout = browserConfig.pool.idleTimeout; // 从配置读取
    this.acquireTimeout = browserConfig.pool.acquireTimeout; // 从配置读取
  }

  /**
   * 获取浏览器实例
   */
  async acquire() {
    // 查找空闲实例
    for (const [id, instance] of this.pool) {
      if (!this.activeConnections.has(id)) {
        this.activeConnections.set(id, {
          acquiredAt: Date.now(),
          lastUsed: Date.now()
        });
        logger.debug(`[POOL] 复用浏览器实例: ${id}`);
        return instance;
      }
    }

    // 创建新实例
    if (this.pool.size < this.maxInstances) {
      return this.createInstance();
    }

    // 等待空闲实例
    logger.warn(`[POOL] 浏览器池已满，等待空闲实例...`);
    await this.waitForAvailableInstance();

    // 重试获取
    return this.acquire();
  }

  /**
   * 释放浏览器实例
   */
  release(instanceId) {
    if (!this.activeConnections.has(instanceId)) {
      logger.warn(`[POOL] 尝试释放未获取的实例: ${instanceId}`);
      return;
    }

    const connection = this.activeConnections.get(instanceId);
    connection.lastUsed = Date.now();

    this.activeConnections.delete(instanceId);
    logger.debug(`[POOL] 释放浏览器实例: ${instanceId}`);
  }

  /**
   * 创建新的浏览器实例
   */
  async createInstance() {
    const instanceId = `browser-${++this.instanceCounter}`;

    try {
      const port = process.env.BROWSER_PORT || webConfigService.getBrowserConstant('DEFAULT_PORT') || 9222;

      const browser = await puppeteer.connect({
        browserURL: `http://127.0.0.1:${port}`,
        defaultViewport: null
      });

      this.pool.set(instanceId, {
        id: instanceId,
        browser: browser,
        createdAt: Date.now(),
        lastUsed: Date.now()
      });

      logger.info(`[POOL] 创建新浏览器实例: ${instanceId}, 当前池大小: ${this.pool.size}`);

      return { id: instanceId, browser };
    } catch (error) {
      logger.error(`[POOL] 创建浏览器实例失败:`, error);
      throw error;
    }
  }

  /**
   * 等待可用实例
   */
  async waitForAvailableInstance() {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        for (const [id] of this.pool) {
          if (!this.activeConnections.has(id)) {
            clearInterval(checkInterval);
            resolve();
            return;
          }
        }
      }, 1000);
    });
  }

  /**
   * 启动清理任务
   */
  startCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleInstances();
    }, 60000); // 每分钟检查一次

    logger.info('[POOL] 启动浏览器实例清理任务');
  }

  /**
   * 停止清理任务
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('[POOL] 停止浏览器实例清理任务');
    }
  }

  /**
   * 清理空闲实例
   */
  cleanupIdleInstances() {
    const now = Date.now();

    for (const [id, instance] of this.pool) {
      // 跳过活跃实例
      if (this.activeConnections.has(id)) {
        continue;
      }

      // 检查是否超时
      if (now - instance.lastUsed > this.idleTimeout) {
        logger.info(`[POOL] 清理空闲浏览器实例: ${id}`);
        this.removeInstance(id);
      }
    }
  }

  /**
   * 移除浏览器实例
   */
  async removeInstance(instanceId) {
    const instance = this.pool.get(instanceId);
    if (!instance) {
      logger.warn(`[POOL] 尝试移除不存在的实例: ${instanceId}`);
      return;
    }

    try {
      // 关闭浏览器
      await instance.browser.close();

      // 从池中移除
      this.pool.delete(instanceId);
      this.activeConnections.delete(instanceId);

      logger.info(`[POOL] 移除浏览器实例: ${instanceId}, 剩余实例: ${this.pool.size}`);
    } catch (error) {
      logger.error(`[POOL] 移除浏览器实例失败:`, error);
    }
  }

  /**
   * 获取池状态
   */
  getStatus() {
    return {
      total: this.pool.size,
      active: this.activeConnections.size,
      idle: this.pool.size - this.activeConnections.size,
      max: this.maxInstances,
      instances: Array.from(this.pool.values()).map(instance => ({
        id: instance.id,
        createdAt: instance.createdAt,
        lastUsed: instance.lastUsed,
        isActive: this.activeConnections.has(instance.id)
      }))
    };
  }

  /**
   * 关闭所有实例
   */
  async closeAll() {
    logger.info('[POOL] 关闭所有浏览器实例...');

    const instanceIds = Array.from(this.pool.keys());

    for (const id of instanceIds) {
      await this.removeInstance(id);
    }

    this.stopCleanup();
    logger.info('[POOL] 所有浏览器实例已关闭');
  }
}

export default new BrowserPool();
