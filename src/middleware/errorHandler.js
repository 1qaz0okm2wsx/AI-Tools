/**
 * 统一错误处理中间件
 */

import { logger } from '../utils/logger.js';

/**
 * 异步路由包装器 - 自动捕获异步错误
 * @param {Function} fn - 异步路由处理函数
 * @returns {Function}
 */
export const asyncHandler = (fn) => (/** @type {any} */ req, /** @type {any} */ res, /** @type {any} */ next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * 错误处理中间件
 * @param {any} err
 * @param {any} req
 * @param {any} res
 * @param {any} _next
 */
export const errorMiddleware = (err, req, res, _next) => {
  // 记录完整错误信息
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    body: req.body,
    query: req.query,
    params: req.params
  });

  // 确定错误状态码
  const errAny = /** @type {any} */ (err);
  const status = errAny.status || errAny.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  // 错误响应对象
  /** @type {any} */
  const errorResponse = {
    error: {
      message: isProduction && status === 500
        ? '服务器内部错误'
        : err.message,
      code: errAny.code || 'INTERNAL_ERROR',
      type: errAny.type || 'server_error'
    }
  };

  // 开发环境添加堆栈信息
  if (!isProduction) {
    errorResponse.error.stack = err.stack;
    errorResponse.error.details = {
      url: req.url,
      method: req.method,
      timestamp: new Date().toISOString()
    };
  }

  res.status(status).json(errorResponse);
};

/**
 * 404 错误处理
 * @param {any} req
 * @param {any} res
 */
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: {
      message: `路由不存在: ${req.method} ${req.url}`,
      code: 'NOT_FOUND',
      type: 'client_error'
    }
  });
};

/**
 * 自定义错误类
 */
export class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   * @param {string} code
   * @param {string} type
   */
  constructor(message, status = 500, code = 'INTERNAL_ERROR', type = 'server_error') {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.type = type;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 验证错误
 */
export class ValidationError extends AppError {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message, 400, 'VALIDATION_ERROR', 'validation_error');
    this.name = 'ValidationError';
  }
}

/**
 * 认证错误
 */
export class AuthenticationError extends AppError {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message, 401, 'AUTHENTICATION_ERROR', 'authentication_error');
    this.name = 'AuthenticationError';
  }
}

/**
 * 权限错误
 */
export class AuthorizationError extends AppError {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message, 403, 'AUTHORIZATION_ERROR', 'authorization_error');
    this.name = 'AuthorizationError';
  }
}

/**
 * 资源不存在错误
 */
export class NotFoundError extends AppError {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message, 404, 'NOT_FOUND', 'client_error');
    this.name = 'NotFoundError';
  }
}

/**
 * 业务逻辑错误
 */
export class BusinessError extends AppError {
  /**
   * @param {string} message
   * @param {string} code
   */
  constructor(message, code = 'BUSINESS_ERROR') {
    super(message, 400, code, 'business_error');
    this.name = 'BusinessError';
  }
}