/**
 * 熔断器
 */

import { logger } from '../utils/logger.js';
import configService from '../config/index.js';

export class CircuitBreaker {
  constructor() {
    this.circuitStates = new Map(); // service -> { state, failureCount, lastFailureTime, nextAttemptTime }
    this.enabled = false;
    this.failureThreshold = 5;
    this.recoveryTimeout = 60000; // 1分钟
    this.states = {
      CLOSED: 'closed',
      OPEN: 'open',
      HALF_OPEN: 'half_open'
    };
  }

  /**
   * 初始化熔断器
   */
  init() {
    const mode = configService.getUsageMode();
    const circuitConfig = configService.getCircuitBreakerConfig();

    this.enabled = circuitConfig.enabled;
    this.failureThreshold = circuitConfig.failure_threshold;
    this.recoveryTimeout = circuitConfig.recovery_timeout;

    logger.info(`[CIRCUIT] 熔断器已${this.enabled ? '启用' : '禁用'}，模式: ${mode}`);
  }

  /**
   * 执行带熔断保护的操作
   * @param {string} service - 服务名称
   * @param {Function} fn - 操作函数
   * @returns {Promise<any>} 操作结果
   */
  async execute(service, fn) {
    if (!this.enabled) {
      return await fn();
    }

    const state = this.getCircuitState(service);

    if (state.state === this.states.OPEN) {
      if (Date.now() < state.nextAttemptTime) {
        logger.warn(`[CIRCUIT] 服务 ${service} 熔断器已打开，拒绝请求`);
        throw new Error(`服务 ${service} 熔断器已打开，请稍后重试`);
      } else {
        this.setCircuitState(service, this.states.HALF_OPEN);
        logger.info(`[CIRCUIT] 服务 ${service} 熔断器进入半开状态`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess(service);
      return result;
    } catch (error) {
      this.onFailure(service, error);
      throw error;
    }
  }

  /**
   * 获取熔断器状态
   * @param {string} service - 服务名称
   * @returns {Object} 熔断器状态
   */
  getCircuitState(service) {
    const state = this.circuitStates.get(service) || {
      state: this.states.CLOSED,
      failureCount: 0,
      lastFailureTime: null,
      nextAttemptTime: null
    };

    return state;
  }

  /**
   * 设置熔断器状态
   * @param {string} service - 服务名称
   * @param {string} state - 状态
   */
  setCircuitState(service, state) {
    const currentState = this.circuitStates.get(service) || {};
    this.circuitStates.set(service, {
      ...currentState,
      state,
      nextAttemptTime: state === this.states.OPEN ? Date.now() + this.recoveryTimeout : null
    });
  }

  /**
   * 成功回调
   * @param {string} service - 服务名称
   */
  onSuccess(service) {
    const state = this.getCircuitState(service);

    if (state.state === this.states.HALF_OPEN) {
      this.setCircuitState(service, this.states.CLOSED);
      logger.info(`[CIRCUIT] 服务 ${service} 熔断器已关闭`);
    }

    state.failureCount = 0;
    this.circuitStates.set(service, state);
  }

  /**
   * 失败回调
   * @param {string} service - 服务名称
   * @param {Error} error - 错误对象
   */
  onFailure(service, error) {
    const state = this.getCircuitState(service);
    state.failureCount++;
    state.lastFailureTime = Date.now();

    if (state.failureCount >= this.failureThreshold) {
      this.setCircuitState(service, this.states.OPEN);
      logger.error(`[CIRCUIT] 服务 ${service} 熔断器已打开（失败次数: ${state.failureCount}）`, error.message);
    }

    this.circuitStates.set(service, state);
  }

  /**
   * 重置熔断器
   * @param {string} service - 服务名称
   */
  reset(service) {
    this.circuitStates.delete(service);
    logger.info(`[CIRCUIT] 服务 ${service} 熔断器已重置`);
  }

  /**
   * 重置所有熔断器
   */
  resetAll() {
    const count = this.circuitStates.size;
    this.circuitStates.clear();
    logger.info(`[CIRCUIT] 已重置所有熔断器 (${count} 个)`);
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const stats = {
      enabled: this.enabled,
      failureThreshold: this.failureThreshold,
      recoveryTimeout: this.recoveryTimeout,
      services: {}
    };

    for (const [service, state] of this.circuitStates) {
      stats.services[service] = {
        state: state.state,
        failureCount: state.failureCount,
        lastFailureTime: state.lastFailureTime,
        nextAttemptTime: state.nextAttemptTime
      };
    }

    return stats;
  }
}

export default new CircuitBreaker();