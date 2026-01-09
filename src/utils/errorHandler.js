/**
 * 错误处理和自动恢复模块
 */

import { logger } from './logger.js';

/**
 * 错误类型枚举
 */
export const ErrorTypes = {
  BROWSER_CONNECTION: 'browser_connection',
  BROWSER_DISCONNECTED: 'browser_disconnected',
  PAGE_LOAD: 'page_load',
  ELEMENT_NOT_FOUND: 'element_not_found',
  COOKIE_LOAD: 'cookie_load',
  COOKIE_SAVE: 'cookie_save',
  LOGIN_DETECTION: 'login_detection',
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  UNKNOWN: 'unknown'
};

/**
 * 错误严重级别
 */
export const ErrorSeverity = {
  CRITICAL: 'critical',  // 致命错误，需要立即处理
  HIGH: 'high',         // 高级错误，影响主要功能
  MEDIUM: 'medium',     // 中级错误，部分功能受影响
  LOW: 'low'           // 低级错误，可以忽略
};

/**
 * 错误处理器类
 */
export class ErrorHandler {
  constructor() {
    this.errorHistory = [];
    this.maxHistorySize = 100;
    this.retryStrategies = new Map();
    this.recoveryCallbacks = new Map();
    
    // 初始化默认重试策略
    this.initializeDefaultStrategies();
  }

  /**
   * 初始化默认重试策略
   */
  initializeDefaultStrategies() {
    // 浏览器连接错误：3次重试，间隔递增
    this.retryStrategies.set(ErrorTypes.BROWSER_CONNECTION, {
      maxAttempts: 3,
      baseDelay: 2000,
      multiplier: 2,
      maxDelay: 10000
    });

    // 页面加载错误：2次重试
    this.retryStrategies.set(ErrorTypes.PAGE_LOAD, {
      maxAttempts: 2,
      baseDelay: 3000,
      multiplier: 1.5,
      maxDelay: 8000
    });

    // 元素查找错误：5次重试，间隔较短
    this.retryStrategies.set(ErrorTypes.ELEMENT_NOT_FOUND, {
      maxAttempts: 5,
      baseDelay: 1000,
      multiplier: 1.2,
      maxDelay: 5000
    });

    // Cookie加载错误：2次重试
    this.retryStrategies.set(ErrorTypes.COOKIE_LOAD, {
      maxAttempts: 2,
      baseDelay: 1000,
      multiplier: 1,
      maxDelay: 2000
    });

    // 网络错误：3次重试
    this.retryStrategies.set(ErrorTypes.NETWORK, {
      maxAttempts: 3,
      baseDelay: 2000,
      multiplier: 2,
      maxDelay: 10000
    });
  }

  /**
   * 记录错误
   */
  logError(error, type = ErrorTypes.UNKNOWN, severity = ErrorSeverity.MEDIUM, context = {}) {
    const errorRecord = {
      timestamp: Date.now(),
      type,
      severity,
      message: error.message || String(error),
      stack: error.stack,
      context,
      recovered: false
    };

    this.errorHistory.push(errorRecord);

    // 限制历史记录大小
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }

    // 根据严重级别选择日志方法
    const logMethod = severity === ErrorSeverity.CRITICAL ? 'error' : 
                     severity === ErrorSeverity.HIGH ? 'error' :
                     severity === ErrorSeverity.MEDIUM ? 'warn' : 'debug';

    logger[logMethod](`[ERROR] [${type}] [${severity}] ${error.message}`, {
      context,
      stack: error.stack
    });

    return errorRecord;
  }

  /**
   * 执行带重试的操作
   */
  async executeWithRetry(fn, errorType = ErrorTypes.UNKNOWN, context = {}) {
    const strategy = this.retryStrategies.get(errorType) || {
      maxAttempts: 1,
      baseDelay: 1000,
      multiplier: 1,
      maxDelay: 5000
    };

    let lastError;
    let attempt = 0;

    while (attempt < strategy.maxAttempts) {
      attempt++;
      
      try {
        logger.debug(`[RETRY] ${errorType} - 尝试 ${attempt}/${strategy.maxAttempts}`);
        const result = await fn();
        
        if (attempt > 1) {
          logger.info(`[RETRY] ${errorType} - 第 ${attempt} 次尝试成功`);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        this.logError(error, errorType, ErrorSeverity.MEDIUM, {
          ...context,
          attempt,
          maxAttempts: strategy.maxAttempts
        });

        // 如果还有重试机会，等待后重试
        if (attempt < strategy.maxAttempts) {
          const delay = Math.min(
            strategy.baseDelay * Math.pow(strategy.multiplier, attempt - 1),
            strategy.maxDelay
          );
          
          logger.debug(`[RETRY] ${errorType} - ${delay}ms 后重试...`);
          await this.delay(delay);
        }
      }
    }

    // 所有重试都失败
    logger.error(`[RETRY] ${errorType} - 所有 ${strategy.maxAttempts} 次尝试均失败`);
    throw lastError;
  }

  /**
   * 注册恢复回调
   */
  registerRecoveryCallback(errorType, callback) {
    this.recoveryCallbacks.set(errorType, callback);
    logger.debug(`[RECOVERY] 已注册 ${errorType} 的恢复回调`);
  }

  /**
   * 尝试自动恢复
   */
  async attemptRecovery(error, errorType, context = {}) {
    const callback = this.recoveryCallbacks.get(errorType);
    
    if (!callback) {
      logger.debug(`[RECOVERY] 没有为 ${errorType} 注册恢复回调`);
      return false;
    }

    try {
      logger.info(`[RECOVERY] 尝试从 ${errorType} 恢复...`);
      await callback(error, context);
      logger.info(`[RECOVERY] ${errorType} 恢复成功`);
      
      // 标记错误已恢复
      const errorRecord = this.errorHistory.find(
        e => e.type === errorType && !e.recovered
      );
      if (errorRecord) {
        errorRecord.recovered = true;
      }
      
      return true;
    } catch (recoveryError) {
      logger.error(`[RECOVERY] ${errorType} 恢复失败: ${recoveryError.message}`);
      this.logError(recoveryError, `${errorType}_recovery`, ErrorSeverity.HIGH, context);
      return false;
    }
  }

  /**
   * 获取错误统计
   */
  getErrorStats() {
    const stats = {
      total: this.errorHistory.length,
      byType: {},
      bySeverity: {},
      recovered: 0,
      unrecovered: 0
    };

    for (const error of this.errorHistory) {
      // 按类型统计
      stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
      
      // 按严重级别统计
      stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
      
      // 恢复统计
      if (error.recovered) {
        stats.recovered++;
      } else {
        stats.unrecovered++;
      }
    }

    return stats;
  }

  /**
   * 获取最近的错误
   */
  getRecentErrors(count = 10) {
    return this.errorHistory.slice(-count).reverse();
  }

  /**
   * 清除错误历史
   */
  clearHistory() {
    const count = this.errorHistory.length;
    this.errorHistory = [];
    logger.info(`[ERROR] 已清除 ${count} 条错误历史`);
  }

  /**
   * 延迟函数
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 包装函数以添加错误处理
   */
  wrap(fn, errorType = ErrorTypes.UNKNOWN, options = {}) {
    const {
      retry = false,
      recover = false,
      severity = ErrorSeverity.MEDIUM,
      context = {}
    } = options;

    return async (...args) => {
      try {
        if (retry) {
          return await this.executeWithRetry(
            () => fn(...args),
            errorType,
            context
          );
        } else {
          return await fn(...args);
        }
      } catch (error) {
        this.logError(error, errorType, severity, context);

        if (recover) {
          const recovered = await this.attemptRecovery(error, errorType, context);
          if (recovered) {
            // 恢复成功，重新执行
            return await fn(...args);
          }
        }

        throw error;
      }
    };
  }
}

// 导出单例
export const errorHandler = new ErrorHandler();

/**
 * 装饰器：为函数添加错误处理和重试
 */
export function withErrorHandling(errorType, options = {}) {
  return function (target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = errorHandler.wrap(originalMethod, errorType, options);
    
    return descriptor;
  };
}

/**
 * 辅助函数：安全执行
 */
export async function safeExecute(fn, fallback = null, errorType = ErrorTypes.UNKNOWN) {
  try {
    return await fn();
  } catch (error) {
    errorHandler.logError(error, errorType, ErrorSeverity.LOW);
    return fallback;
  }
}

/**
 * 辅助函数：批量执行
 */
export async function executeAll(tasks, options = {}) {
  const {
    continueOnError = false,
    maxConcurrent = Infinity
  } = options;

  const results = [];
  const errors = [];

  if (maxConcurrent === Infinity) {
    // 并发执行所有任务
    const promises = tasks.map(async (task, index) => {
      try {
        const result = await task();
        results[index] = { success: true, result };
      } catch (error) {
        errors.push({ index, error });
        results[index] = { success: false, error };
        
        if (!continueOnError) {
          throw error;
        }
      }
    });

    await Promise.all(promises);
  } else {
    // 限制并发数
    for (let i = 0; i < tasks.length; i += maxConcurrent) {
      const batch = tasks.slice(i, i + maxConcurrent);
      const batchPromises = batch.map(async (task, batchIndex) => {
        const index = i + batchIndex;
        try {
          const result = await task();
          results[index] = { success: true, result };
        } catch (error) {
          errors.push({ index, error });
          results[index] = { success: false, error };
          
          if (!continueOnError) {
            throw error;
          }
        }
      });

      await Promise.all(batchPromises);
    }
  }

  return { results, errors, hasErrors: errors.length > 0 };
}