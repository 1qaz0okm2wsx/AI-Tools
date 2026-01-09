/**
 * 请求限流器
 */

import { logger } from '../utils/logger.js';
import configService from '../config/index.js';

export class RateLimiter {
  constructor() {
    this.requests = new Map(); // IP -> { count, resetTime }
    this.enabled = false;
    this.requestsPerMinute = 60;
    this.requestsPerHour = 1000;
    this.whitelist = new Set(); // 白名单IP
  }

  /**
   * 初始化限流器
   */
  init() {
    const mode = configService.getUsageMode();
    const rateLimitConfig = configService.getRateLimitConfig();

    this.enabled = rateLimitConfig.enabled;
    this.requestsPerMinute = rateLimitConfig.requests_per_minute;
    this.requestsPerHour = rateLimitConfig.requests_per_hour;

    logger.info(`[RATE_LIMIT] 限流器已${this.enabled ? '启用' : '禁用'}，模式: ${mode}`);
  }

  /**
   * 检查请求是否允许
   * @param {string} ip - 客户端IP
   * @returns {Object} 检查结果
   */
  check(ip) {
    if (!this.enabled) {
      return { allowed: true };
    }

    if (this.whitelist.has(ip)) {
      return { allowed: true, whitelisted: true };
    }

    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const hour = Math.floor(now / 3600000);

    const key = `${ip}_${minute}`;
    const hourKey = `${ip}_${hour}`;

    const data = this.requests.get(key) || { count: 0, resetTime: minute * 60000 };
    const hourData = this.requests.get(hourKey) || { count: 0, resetTime: hour * 3600000 };

    data.count++;
    hourData.count++;
    this.requests.set(key, data);
    this.requests.set(hourKey, hourData);

    let allowed = true;
    let reason = null;

    if (this.requestsPerMinute > 0 && data.count > this.requestsPerMinute) {
      allowed = false;
      reason = `每分钟请求数超过限制 (${this.requestsPerMinute})`;
    }

    if (this.requestsPerHour > 0 && hourData.count > this.requestsPerHour) {
      allowed = false;
      reason = `每小时请求数超过限制 (${this.requestsPerHour})`;
    }

    if (!allowed) {
      logger.warn(`[RATE_LIMIT] 请求被拒绝: ${ip} - ${reason}`);
    }

    return {
      allowed,
      reason,
      remaining: {
        perMinute: Math.max(0, this.requestsPerMinute - data.count),
        perHour: Math.max(0, this.requestsPerHour - hourData.count)
      },
      resetTime: {
        perMinute: (minute + 1) * 60000,
        perHour: (hour + 1) * 3600000
      }
    };
  }

  /**
   * 重置IP的请求计数
   * @param {string} ip - 客户端IP
   */
  reset(ip) {
    const keys = Array.from(this.requests.keys()).filter(key => key.startsWith(ip));
    for (const key of keys) {
      this.requests.delete(key);
    }
    logger.info(`[RATE_LIMIT] 已重置IP的请求计数: ${ip}`);
  }

  /**
   * 添加IP到白名单
   * @param {string} ip - 客户端IP
   */
  addToWhitelist(ip) {
    this.whitelist.add(ip);
    logger.info(`[RATE_LIMIT] 已添加IP到白名单: ${ip}`);
  }

  /**
   * 从白名单移除IP
   * @param {string} ip - 客户端IP
   */
  removeFromWhitelist(ip) {
    this.whitelist.delete(ip);
    logger.info(`[RATE_LIMIT] 已从白名单移除IP: ${ip}`);
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const now = Date.now();
    const activeKeys = Array.from(this.requests.keys()).filter(key => {
      const data = this.requests.get(key);
      return data && now - data.resetTime < 3600000;
    });

    return {
      enabled: this.enabled,
      requestsPerMinute: this.requestsPerMinute,
      requestsPerHour: this.requestsPerHour,
      activeIPs: new Set(activeKeys.map(key => key.split('_')[0])).size,
      whitelistSize: this.whitelist.size
    };
  }

  /**
   * 清理过期数据
   */
  cleanup() {
    const now = Date.now();
    const expiredKeys = [];

    for (const [key, data] of this.requests) {
      if (now - data.resetTime > 3600000) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.requests.delete(key);
    }

    if (expiredKeys.length > 0) {
      logger.debug(`[RATE_LIMIT] 清理了 ${expiredKeys.length} 条过期数据`);
    }
  }
}

export default new RateLimiter();