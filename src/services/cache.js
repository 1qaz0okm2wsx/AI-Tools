/**
 * 响应缓存管理器
 */

import { logger } from '../utils/logger.js';
import configService from '../config/index.js';

export class CacheManager {
  constructor() {
    this.cache = new Map();
    this.enabled = false;
    this.ttl = 300; // 默认5分钟
    this.maxSize = 1000;
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0
    };
  }

  /**
   * 初始化缓存管理器
   */
  init() {
    const mode = configService.getUsageMode();
    const cacheConfig = configService.getCacheConfig();

    this.enabled = cacheConfig.enabled;
    this.ttl = cacheConfig.ttl;

    logger.info(`[CACHE] 缓存管理器已${this.enabled ? '启用' : '禁用'}，TTL: ${this.ttl}s，模式: ${mode}`);

    if (this.enabled) {
      this.startCleanup();
    }
  }

  /**
   * 获取缓存
   * @param {string} key - 缓存键
   * @returns {any | undefined} 缓存值
   */
  get(key) {
    if (!this.enabled) {
      return undefined;
    }

    const item = this.cache.get(key);
    if (!item) {
      this.stats.misses++;
      return undefined;
    }

    const now = Date.now();
    if (now > item.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.evictions++;
      logger.debug(`[CACHE] 缓存已过期: ${key}`);
      return undefined;
    }

    item.lastAccessed = now;
    this.stats.hits++;
    logger.debug(`[CACHE] 缓存命中: ${key}`);
    return item.value;
  }

  /**
   * 设置缓存
   * @param {string} key - 缓存键
   * @param {any} value - 缓存值
   * @param {number} [customTTL] - 自定义TTL（秒）
   */
  set(key, value, customTTL) {
    if (!this.enabled) {
      return;
    }

    const ttl = customTTL || this.ttl;
    const now = Date.now();

    const item = {
      value,
      createdAt: now,
      lastAccessed: now,
      expiresAt: now + ttl * 1000
    };

    this.cache.set(key, item);
    this.stats.sets++;

    // 检查缓存大小
    if (this.cache.size > this.maxSize) {
      this.evictOldest();
    }

    logger.debug(`[CACHE] 缓存已设置: ${key} (TTL: ${ttl}s)`);
  }

  /**
   * 删除缓存
   * @param {string} key - 缓存键
   */
  delete(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.deletes++;
      logger.debug(`[CACHE] 缓存已删除: ${key}`);
    }
  }

  /**
   * 清空缓存
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.stats.deletes += size;
    logger.info(`[CACHE] 缓存已清空 (${size} 条)`);
  }

  /**
   * 淘汰最旧的缓存
   */
  evictOldest() {
    let oldestKey = null;
    let oldestTime = Date.now();

    for (const [key, item] of this.cache) {
      if (item.lastAccessed < oldestTime) {
        oldestTime = item.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
      logger.debug(`[CACHE] 淘汰最旧缓存: ${oldestKey}`);
    }
  }

  /**
   * 清理过期缓存
   */
  cleanup() {
    const now = Date.now();
    const expiredKeys = [];

    for (const [key, item] of this.cache) {
      if (now > item.expiresAt) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.stats.evictions++;
    }

    if (expiredKeys.length > 0) {
      logger.debug(`[CACHE] 清理了 ${expiredKeys.length} 条过期缓存`);
    }
  }

  /**
   * 启动定期清理
   */
  startCleanup() {
    setInterval(() => {
      this.cleanup();
    }, 60000); // 每分钟清理一次
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0 ?
      (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2) : 0;

    return {
      enabled: this.enabled,
      ttl: this.ttl,
      maxSize: this.maxSize,
      currentSize: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: `${hitRate}%`,
      sets: this.stats.sets,
      deletes: this.stats.deletes,
      evictions: this.stats.evictions
    };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0
    };
    logger.info('[CACHE] 统计已重置');
  }
}

export default new CacheManager();