/**
 * 请求管理器模块 - 管理并发请求和请求队列
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

/**
 * 请求上下文类
 */
class RequestContext {
  /**
   * @param {string} requestId
   */
  constructor(requestId) {
    this.requestId = requestId;
    this.status = 'pending';  // pending, running, completed, cancelled
    this.createdAt = Date.now();
    this.startedAt = null;
    this.completedAt = null;
    this.cancelReason = null;
    this._stopChecker = null;
  }

  start() {
    this.status = 'running';
    this.startedAt = Date.now();
  }

  complete() {
    this.status = 'completed';
    this.completedAt = Date.now();
  }

  cancel(reason = '已取消') {
    this.status = 'cancelled';
    this.cancelReason = reason;
    this.completedAt = Date.now();
  }

  /**
   * @param {() => boolean} checker
   */
  setStopChecker(checker) {
    this._stopChecker = checker;
  }

  shouldStop() {
    if (this.status === 'cancelled') return true;
    if (this._stopChecker) return this._stopChecker();
    return false;
  }

  getDuration() {
    if (!this.startedAt) return 0;
    const endTime = this.completedAt || Date.now();
    return endTime - this.startedAt;
  }
}

/**
 * 请求管理器类
 */
class RequestManager {
  constructor() {
    this.activeRequest = null;  // 当前活动请求
    this.waitingRequests = [];  // 等待队列
    this.mutex = false;         // 简单的互斥锁
    this.maxWaitTime = 60000;   // 最大等待时间 60秒
    /** @type {Array<{requestId: string, status: string, duration: number, createdAt: number, cancelReason: string | null}>} */
    this.requestHistory = [];   // 请求历史
    this.maxHistory = 100;      // 最大历史记录数
  }

  /**
   * 创建新请求上下文
   */
  createRequest() {
    return new RequestContext(uuidv4());
  }

  /**
   * 获取锁（带超时）
   * @param {RequestContext} ctx
   * @param {number} timeout
   */
  async acquire(ctx, timeout = this.maxWaitTime) {
    const startTime = Date.now();

    // 如果有活动请求，取消它
    if (this.activeRequest) {
      logger.info(`[REQUEST] 新请求 ${ctx.requestId} 取消旧请求 ${this.activeRequest.requestId}`);
      this.activeRequest.cancel('被新请求取代');
    }

    // 等待获取锁
    while (this.mutex) {
      if (Date.now() - startTime > timeout) {
        ctx.cancel('等待超时');
        logger.warn(`[REQUEST] 请求 ${ctx.requestId} 等待超时`);
        return false;
      }

      if (ctx.shouldStop()) {
        ctx.cancel('在等待时被取消');
        return false;
      }

      await this.delay(100);
    }

    // 获取锁
    this.mutex = true;
    this.activeRequest = ctx;
    ctx.start();
    logger.debug(`[REQUEST] 请求 ${ctx.requestId} 获取到锁`);
    return true;
  }

  /**
   * 释放锁
   * @param {RequestContext} ctx
   * @param {boolean} _success
   */
  release(ctx, _success = true) {
    if (this.activeRequest?.requestId === ctx.requestId) {
      ctx.complete();
      this.activeRequest = null;
      this.mutex = false;

      // 记录历史
      this.recordHistory(ctx);

      logger.debug(`[REQUEST] 请求 ${ctx.requestId} 释放锁 (耗时: ${ctx.getDuration()}ms)`);
    }
  }

  /**
   * 取消当前请求
   */
  cancelCurrent(reason = '手动取消') {
    if (this.activeRequest) {
      this.activeRequest.cancel(reason);
      logger.info(`[REQUEST] 取消当前请求: ${reason}`);
      return true;
    }
    return false;
  }

  /**
   * 记录请求历史
   * @param {RequestContext} ctx
   */
  recordHistory(ctx) {
    this.requestHistory.push({
      requestId: ctx.requestId,
      status: ctx.status,
      duration: ctx.getDuration(),
      createdAt: ctx.createdAt,
      cancelReason: ctx.cancelReason
    });

    // 限制历史记录数量
    if (this.requestHistory.length > this.maxHistory) {
      this.requestHistory.shift();
    }
  }

  /**
   * 获取请求统计
   */
  getStats() {
    const total = this.requestHistory.length;
    const completed = this.requestHistory.filter(r => r.status === 'completed').length;
    const cancelled = this.requestHistory.filter(r => r.status === 'cancelled').length;
    const avgDuration = total > 0 
      ? Math.round(this.requestHistory.reduce((sum, r) => sum + r.duration, 0) / total)
      : 0;

    return {
      total,
      completed,
      cancelled,
      avgDuration,
      hasActiveRequest: !!this.activeRequest
    };
  }

  /**
   * 清除历史
   */
  clearHistory() {
    this.requestHistory = [];
    logger.info('[REQUEST] 请求历史已清除');
  }

  /**
   * 延迟函数
   * @param {number} ms
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 导出单例
export const requestManager = new RequestManager();