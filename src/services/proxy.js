/**
 * 代理管理器
 */

import { logger } from '../utils/logger.js';
import configService from '../config/index.js';

export class ProxyManager {
  constructor() {
    this.proxies = [];
    this.currentProxyIndex = 0;
    this.enabled = false;
  }

  /**
   * 初始化代理管理器
   */
  init() {
    const mode = configService.getUsageMode();
    this.enabled = mode === 'service';

    if (this.enabled) {
      logger.info('[PROXY] 代理管理器已启用');
    } else {
      logger.info('[PROXY] 代理管理器已禁用（个人模式）');
    }
  }

  /**
   * 添加代理
   * @param {Object} proxy - 代理配置
   */
  addProxy(proxy) {
    if (!proxy.host || !proxy.port) {
      throw new Error('代理配置无效，必须包含 host 和 port');
    }

    this.proxies.push({
      ...proxy,
      id: `proxy_${this.proxies.length + 1}`,
      createdAt: Date.now(),
      usageCount: 0,
      lastUsed: null,
      health: 'unknown'
    });

    logger.info(`[PROXY] 已添加代理: ${proxy.host}:${proxy.port}`);
  }

  /**
   * 获取当前代理
   * @returns {Object | undefined} 当前代理
   */
  getCurrentProxy() {
    if (!this.enabled || this.proxies.length === 0) {
      return undefined;
    }

    const proxy = this.proxies[this.currentProxyIndex];
    proxy.usageCount++;
    proxy.lastUsed = Date.now();

    logger.debug(`[PROXY] 使用代理: ${proxy.host}:${proxy.port}`);
    return proxy;
  }

  /**
   * 切换到下一个代理
   */
  nextProxy() {
    if (this.proxies.length === 0) {
      return;
    }

    this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxies.length;
    logger.info(`[PROXY] 切换到代理: ${this.proxies[this.currentProxyIndex].host}:${this.proxies[this.currentProxyIndex].port}`);
  }

  /**
   * 获取代理统计
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      total: this.proxies.length,
      enabled: this.enabled,
      currentIndex: this.currentProxyIndex,
      proxies: this.proxies.map(p => ({
        host: p.host,
        port: p.port,
        protocol: p.protocol || 'http',
        usageCount: p.usageCount,
        lastUsed: p.lastUsed,
        health: p.health
      }))
    };
  }

  /**
   * 测试代理连接
   * @param {Object} proxy - 代理配置
   * @returns {Promise<boolean>} 是否可用
   */
  async testProxy(proxy) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`http://${proxy.host}:${proxy.port}`, {
        signal: controller.signal,
        method: 'HEAD'
      });

      clearTimeout(timeoutId);

      const isHealthy = response.ok;
      proxy.health = isHealthy ? 'healthy' : 'unhealthy';

      logger.info(`[PROXY] 代理测试: ${proxy.host}:${proxy.port} - ${isHealthy ? '可用' : '不可用'}`);
      return isHealthy;
    } catch (error) {
      proxy.health = 'unhealthy';
      logger.warn(`[PROXY] 代理测试失败: ${proxy.host}:${proxy.port}`, error.message);
      return false;
    }
  }

  /**
   * 获取代理URL
   * @returns {string | undefined} 代理URL
   */
  getProxyUrl() {
    const proxy = this.getCurrentProxy();
    if (!proxy) {
      return undefined;
    }

    const protocol = proxy.protocol || 'http';
    const auth = proxy.username && proxy.password ? 
      `${proxy.username}:${proxy.password}@` : '';
    return `${protocol}://${auth}${proxy.host}:${proxy.port}`;
  }

  /**
   * 清除所有代理
   */
  clearProxies() {
    const count = this.proxies.length;
    this.proxies = [];
    this.currentProxyIndex = 0;
    logger.info(`[PROXY] 已清除所有代理 (${count} 个)`);
  }
}

export default new ProxyManager();