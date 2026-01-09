/**
 * 数据库连接池管理器
 */

import sqlite3 from 'sqlite3';
import { logger } from '../../utils/logger.js';

export class DatabasePool {
  constructor(dbPath, options = {}) {
    this.dbPath = dbPath;
    this.options = {
      maxConnections: options.maxConnections || 10,
      idleTimeout: options.idleTimeout || 300000, // 5分钟
      acquireTimeout: options.acquireTimeout || 5000, // 5秒
      ...options
    };

    this.pool = new Map(); // 存储连接
    this.activeConnections = new Map(); // 存储活跃连接
    this.connectionCounter = 0; // 连接计数器
    this.cleanupInterval = null;
  }

  /**
   * 获取数据库连接
   */
  async acquire() {
    const startTime = Date.now();

    // 查找空闲连接
    for (const [id, connection] of this.pool) {
      if (!this.activeConnections.has(id)) {
        this.activeConnections.set(id, {
          acquiredAt: Date.now(),
          lastUsed: Date.now()
        });
        logger.debug(`[DB-POOL] 复用数据库连接: ${id}`);
        return connection;
      }
    }

    // 创建新连接
    if (this.pool.size < this.options.maxConnections) {
      return this.createConnection();
    }

    // 等待可用连接
    logger.warn(`[DB-POOL] 连接池已满，等待可用连接...`);

    try {
      return await this.waitForAvailableConnection(startTime);
    } catch (error) {
      logger.error(`[DB-POOL] 获取连接超时`);
      throw new Error('获取数据库连接超时');
    }
  }

  /**
   * 释放数据库连接
   */
  release(connectionId) {
    if (!this.activeConnections.has(connectionId)) {
      logger.warn(`[DB-POOL] 尝试释放未获取的连接: ${connectionId}`);
      return;
    }

    const connection = this.activeConnections.get(connectionId);
    connection.lastUsed = Date.now();

    this.activeConnections.delete(connectionId);
    logger.debug(`[DB-POOL] 释放数据库连接: ${connectionId}`);
  }

  /**
   * 创建新的数据库连接
   */
  createConnection() {
    const connectionId = `db-conn-${++this.connectionCounter}`;

    try {
      const db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          logger.error(`[DB-POOL] 创建数据库连接失败:`, err);
          throw err;
        }
      });

      // 配置连接
      db.configure('busyTimeout', this.options.acquireTimeout);

      this.pool.set(connectionId, {
        id: connectionId,
        db: db,
        createdAt: Date.now(),
        lastUsed: Date.now()
      });

      logger.info(`[DB-POOL] 创建新数据库连接: ${connectionId}, 当前池大小: ${this.pool.size}`);

      return { id: connectionId, db };
    } catch (error) {
      logger.error(`[DB-POOL] 创建数据库连接失败:`, error);
      throw error;
    }
  }

  /**
   * 等待可用连接
   */
  async waitForAvailableConnection(startTime) {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        // 检查超时
        if (Date.now() - startTime > this.options.acquireTimeout) {
          clearInterval(checkInterval);
          reject(new Error('获取连接超时'));
          return;
        }

        // 检查可用连接
        for (const [id] of this.pool) {
          if (!this.activeConnections.has(id)) {
            clearInterval(checkInterval);
            resolve();
            return;
          }
        }
      }, 100);
    });
  }

  /**
   * 启动清理任务
   */
  startCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleConnections();
    }, 60000); // 每分钟检查一次

    logger.info('[DB-POOL] 启动数据库连接清理任务');
  }

  /**
   * 停止清理任务
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('[DB-POOL] 停止数据库连接清理任务');
    }
  }

  /**
   * 清理空闲连接
   */
  cleanupIdleConnections() {
    const now = Date.now();
    const minPoolSize = Math.max(1, Math.floor(this.options.maxConnections * 0.3)); // 保留30%的最小连接

    // 如果连接数低于最小池大小，不清理
    if (this.pool.size <= minPoolSize) {
      return;
    }

    for (const [id, connection] of this.pool) {
      // 跳过活跃连接
      if (this.activeConnections.has(id)) {
        continue;
      }

      // 检查是否超时
      if (now - connection.lastUsed > this.options.idleTimeout) {
        logger.info(`[DB-POOL] 清理空闲数据库连接: ${id}`);
        this.removeConnection(id);

        // 如果达到最小池大小，停止清理
        if (this.pool.size <= minPoolSize) {
          break;
        }
      }
    }
  }

  /**
   * 移除数据库连接
   */
  async removeConnection(connectionId) {
    const connection = this.pool.get(connectionId);
    if (!connection) {
      logger.warn(`[DB-POOL] 尝试移除不存在的连接: ${connectionId}`);
      return;
    }

    try {
      // 关闭连接
      await new Promise((resolve, reject) => {
        connection.db.close((err) => {
          if (err) {
            logger.error(`[DB-POOL] 关闭数据库连接失败:`, err);
            return reject(err);
          }
          resolve();
        });
      });

      // 从池中移除
      this.pool.delete(connectionId);
      this.activeConnections.delete(connectionId);

      logger.info(`[DB-POOL] 移除数据库连接: ${connectionId}, 剩余连接: ${this.pool.size}`);
    } catch (error) {
      logger.error(`[DB-POOL] 移除数据库连接失败:`, error);
    }
  }

  /**
   * 获取池状态
   */
  getStatus() {
    return {
      total: this.pool.size,
      active: this.activeConnections.size,
      idle: this.pool.size - this.activeConnections.size,
      max: this.options.maxConnections,
      connections: Array.from(this.pool.values()).map(conn => ({
        id: conn.id,
        createdAt: conn.createdAt,
        lastUsed: conn.lastUsed,
        isActive: this.activeConnections.has(conn.id)
      }))
    };
  }

  /**
   * 关闭所有连接
   */
  async closeAll() {
    logger.info('[DB-POOL] 关闭所有数据库连接...');

    const connectionIds = Array.from(this.pool.keys());

    for (const id of connectionIds) {
      await this.removeConnection(id);
    }

    this.stopCleanup();
    logger.info('[DB-POOL] 所有数据库连接已关闭');
  }
}

export default DatabasePool;
