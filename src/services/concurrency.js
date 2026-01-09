/**
 * 并发请求处理器
 */

import { logger } from '../utils/logger.js';
import configService from '../config/index.js';

export class ConcurrencyManager {
  constructor() {
    this.activeRequests = new Map();
    this.requestQueue = [];
    this.maxConcurrent = -1; // -1 表示无限制
    this.requestCounter = 0;
    this.stats = {
      total: 0,
      successful: 0,
      failed: 0,
      queued: 0,
      active: 0
    };
  }

  /**
   * 初始化并发管理器
   */
  init() {
    const mode = configService.getUsageMode();
    const perfConfig = configService.getPerformanceConfig();
    this.maxConcurrent = perfConfig.concurrent_requests;

    logger.info(`[CONCURRENCY] 并发管理器已初始化，模式: ${mode}，最大并发: ${this.maxConcurrent === -1 ? '无限制' : this.maxConcurrent}`);
  }

  /**
   * 获取并发配置
   * @returns {Object} 并发配置
   */
  getConfig() {
    return {
      max_concurrent: this.maxConcurrent,
      active: this.activeRequests.size,
      queued: this.requestQueue.length,
      unlimited: this.maxConcurrent === -1
    };
  }

  /**
   * 添加请求到队列
   * @param {string} requestId - 请求ID
   * @param {Function} handler - 请求处理函数
   * @param {Object} [metadata] - 请求元数据
   * @returns {Promise<any>} 请求结果
   */
  async enqueue(requestId, handler, metadata = {}) {
    this.requestCounter++;
    this.stats.total++;
    this.stats.queued++;

    const request = {
      id: requestId,
      handler,
      metadata,
      queuedAt: Date.now(),
      priority: metadata.priority || 0
    };

    logger.debug(`[CONCURRENCY] 请求已加入队列: ${requestId} (队列长度: ${this.requestQueue.length})`);

    return new Promise((resolve, reject) => {
      request.resolve = resolve;
      request.reject = reject;

      this.requestQueue.push(request);
      this.processQueue();
    });
  }

  /**
   * 处理队列
   */
  async processQueue() {
    const mode = configService.getUsageMode();
    const perfConfig = configService.getPerformanceConfig();
    this.maxConcurrent = perfConfig.concurrent_requests;

    // 检查是否可以处理更多请求
    const canProcess = this.maxConcurrent === -1 || this.activeRequests.size < this.maxConcurrent;

    if (!canProcess || this.requestQueue.length === 0) {
      return;
    }

    // 按优先级排序
    this.requestQueue.sort((a, b) => b.priority - a.priority);

    // 处理可以处理的请求数量
    const availableSlots = this.maxConcurrent === -1 ? 
      this.requestQueue.length : 
      Math.max(0, this.maxConcurrent - this.activeRequests.size);

    for (let i = 0; i < availableSlots && this.requestQueue.length > 0; i++) {
      const request = this.requestQueue.shift();
      if (!request) break;

      this.activeRequests.set(request.id, request);
      this.stats.queued--;
      this.stats.active++;

      logger.debug(`[CONCURRENCY] 开始处理请求: ${request.id} (活跃: ${this.activeRequests.size})`);

      // 异步处理请求
      this.processRequest(request).catch(error => {
        logger.error(`[CONCURRENCY] 请求处理失败: ${request.id}`, error);
      });
    }
  }

  /**
   * 处理单个请求
   * @param {Object} request - 请求对象
   */
  async processRequest(request) {
    const startTime = Date.now();
    const waitTime = startTime - request.queuedAt;

    try {
      const result = await request.handler();

      const duration = Date.now() - startTime;
      this.stats.successful++;

      logger.debug(`[CONCURRENCY] 请求完成: ${request.id} (等待: ${waitTime}ms, 处理: ${duration}ms)`);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.stats.failed++;

      logger.error(`[CONCURRENCY] 请求失败: ${request.id} (等待: ${waitTime}ms, 处理: ${duration}ms)`, error);

      throw error;
    } finally {
      this.activeRequests.delete(request.id);
      this.stats.active--;

      // 继续处理队列
      this.processQueue();
    }
  }

  /**
   * 取消请求
   * @param {string} requestId - 请求ID
   */
  cancel(requestId) {
    // 检查活跃请求
    const activeRequest = this.activeRequests.get(requestId);
    if (activeRequest) {
      this.activeRequests.delete(requestId);
      this.stats.active--;
      logger.info(`[CONCURRENCY] 取消活跃请求: ${requestId}`);
      return true;
    }

    // 检查队列中的请求
    const queueIndex = this.requestQueue.findIndex(r => r.id === requestId);
    if (queueIndex !== -1) {
      const request = this.requestQueue.splice(queueIndex, 1)[0];
      this.stats.queued--;
      logger.info(`[CONCURRENCY] 取消队列中的请求: ${requestId}`);
      return true;
    }

    logger.warn(`[CONCURRENCY] 请求不存在: ${requestId}`);
    return false;
  }

  /**
   * 获取请求状态
   * @param {string} requestId - 请求ID
   * @returns {Object | undefined} 请求状态
   */
  getRequestStatus(requestId) {
    const activeRequest = this.activeRequests.get(requestId);
    if (activeRequest) {
      return {
        id: requestId,
        status: 'active',
        queuedAt: activeRequest.queuedAt,
        metadata: activeRequest.metadata
      };
    }

    const queuedRequest = this.requestQueue.find(r => r.id === requestId);
    if (queuedRequest) {
      return {
        id: requestId,
        status: 'queued',
        queuedAt: queuedRequest.queuedAt,
        position: this.requestQueue.indexOf(queuedRequest),
        metadata: queuedRequest.metadata
      };
    }

    return undefined;
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      config: this.getConfig()
    };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.stats = {
      total: 0,
      successful: 0,
      failed: 0,
      queued: 0,
      active: 0
    };
    logger.info('[CONCURRENCY] 统计已重置');
  }

  /**
   * 清空队列
   */
  clearQueue() {
    const count = this.requestQueue.length;
    for (const request of this.requestQueue) {
      if (request.reject) {
        request.reject(new Error('队列已清空'));
      }
    }
    this.requestQueue = [];
    this.stats.queued = 0;
    logger.info(`[CONCURRENCY] 队列已清空，取消 ${count} 个请求`);
  }

  /**
   * 等待所有请求完成
   * @returns {Promise<void>}
   */
  async waitForAll() {
    while (this.activeRequests.size > 0 || this.requestQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

export default new ConcurrencyManager();