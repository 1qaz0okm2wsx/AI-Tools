/**
 * 统一的数据库连接获取工具
 */

/**
 * 从请求对象获取数据库连接
 * @param {import('express').Request} req - Express请求对象
 * @returns {import('sqlite3').Database | null} 数据库连接
 */
export function getDatabase(req) {
  return req?.app?.locals?.db || globalThis?.db || null;
}

/**
 * 从请求对象获取数据库连接池
 * @param {import('express').Request} req - Express请求对象
 * @returns {import('./src/services/database/pool.js').DatabasePool | null} 数据库连接池
 */
export function getDatabasePool(req) {
  return req?.app?.locals?.dbPool || globalThis?.dbPool || null;
}

/**
 * 包装数据库操作，自动处理错误
 * @param {import('express').Request} req - Express请求对象
 * @param {Function} operation - 数据库操作函数
 * @returns {Promise<any>} 操作结果
 */
export async function withDatabase(req, operation) {
  const db = getDatabase(req);
  if (!db) {
    throw new Error('数据库连接不可用');
  }
  return await operation(db);
}

/**
 * 包装数据库查询，返回Promise
 * @param {import('sqlite3').Database} db - 数据库连接
 * @param {string} sql - SQL语句
 * @param {any[]} params - 参数
 * @returns {Promise<any>} 查询结果
 */
export function query(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

/**
 * 包装数据库获取，返回Promise
 * @param {import('sqlite3').Database} db - 数据库连接
 * @param {string} sql - SQL语句
 * @param {any[]} params - 参数
 * @returns {Promise<any>} 查询结果
 */
export function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

/**
 * 包装数据库执行，返回Promise
 * @param {import('sqlite3').Database} db - 数据库连接
 * @param {string} sql - SQL语句
 * @param {any[]} params - 参数
 * @returns {Promise<import('sqlite3').RunResult>} 执行结果
 */
export function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
}

export default {
  getDatabase,
  getDatabasePool,
  withDatabase,
  query,
  get,
  run
};