/**
 * 统一的日志记录工具
 */

import { logOperation } from '../../db_init.js';

/**
 * 记录操作日志
 * @param {import('sqlite3').Database} db - 数据库连接
 * @param {string} operationType - 操作类型
 * @param {string} targetType - 目标类型
 * @param {number | null} targetId - 目标ID
 * @param {string} targetName - 目标名称
 * @param {string} details - 操作详情
 * @param {string} status - 操作状态
 * @param {import('express').Request} req - Express请求对象
 */
export function logOperation(db, operationType, targetType, targetId, targetName, details, status, req) {
  if (!db) {
    return;
  }

  try {
    logOperation(db, operationType, targetType, targetId, targetName, details, status, req);
  } catch (error) {
    console.error('记录操作日志失败:', error);
  }
}

/**
 * 包装操作，自动记录日志
 * @param {import('sqlite3').Database} db - 数据库连接
 * @param {string} operationType - 操作类型
 * @param {string} targetType - 目标类型
 * @param {Function} operation - 操作函数
 * @returns {Promise<any>} 操作结果
 */
export async function withOperationLog(db, operationType, targetType, operation) {
  try {
    const result = await operation();
    return result;
  } catch (error) {
    logOperation(db, operationType, targetType, null, 'unknown', 
      `操作失败: ${error.message}`, 'error', { url: 'unknown', method: 'unknown' });
    throw error;
  }
}

/**
 * 批量记录操作日志
 * @param {import('sqlite3').Database} db - 数据库连接
 * @param {Array<{ operationType: string, targetType: string, targetId: number | null, targetName: string, details: string, status: string, req: import('express').Request }>} logs - 日志数组
 */
export function batchLogOperation(db, logs) {
  if (!db || logs.length === 0) {
    return;
  }

  try {
    logs.forEach(log => {
      logOperation(db, log.operationType, log.targetType, log.targetId, 
        log.targetName, log.details, log.status, log.req);
    });
  } catch (error) {
    console.error('批量记录操作日志失败:', error);
  }
}

export default {
  logOperation,
  withOperationLog,
  batchLogOperation
};