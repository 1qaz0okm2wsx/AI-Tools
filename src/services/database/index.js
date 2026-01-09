/**
 * 数据库服务模块
 */

import { MigrationManager } from './migrations.js';
import { logger } from '../../utils/logger.js';

/**
 * 数据库服务类
 */
export class DatabaseService {
  /**
   * @param {any} db - SQLite数据库实例
   */
  constructor(db) {
    this.db = db;
    this.migrationManager = new MigrationManager(db);
  }

  /**
   * 初始化数据库
   */
  async initialize() {
    logger.info('初始化数据库服务...');

    try {
      // 运行迁移
      await this.migrationManager.migrate();

      logger.info('✅ 数据库服务初始化完成');
    } catch (error) {
      logger.error('❌ 数据库服务初始化失败:', error);
      throw error;
    }
  }

  /**
   * 获取数据库统计信息
   * @returns {Promise<{tables: Record<string, {row_count: number}>, indexes: Record<string, string[]>}>}
   */
  async getStats() {
    /** @type {{tables: Record<string, {row_count: number}>, indexes: Record<string, string[]>}} */
    const stats = {
      tables: {},
      indexes: {}
    };

    // 获取所有表
    const tables = await new Promise((resolve, reject) => {
      this.db.all(
        "SELECT name FROM sqlite_master WHERE type='table'",
        (/** @type {Error | null} */ err, /** @type {any[]} */ rows) => {
          if (err) {
            return reject(err);
          }
          resolve(rows);
        }
      );
    });

    tables.forEach((/** @type {any} */ table) => {
      stats.tables[table.name] = { row_count: 0 };
    });

    // 获取每个表的行数
    const tablePromises = Object.keys(stats.tables).map(tableName => {
      return new Promise((/** @type {(value?: void) => void} */ resolve, reject) => {
        this.db.get(
          `SELECT COUNT(*) as count FROM ${tableName}`,
          (/** @type {Error | null} */ err, /** @type {any} */ row) => {
            if (err) {
              return reject(err);
            }
            stats.tables[tableName].row_count = row.count;
            resolve();
          }
        );
      });
    });

    await Promise.all(tablePromises);

    // 获取所有索引
    const indexes = await new Promise((resolve, reject) => {
      this.db.all(
        "SELECT name, tbl_name FROM sqlite_master WHERE type='index'",
        (/** @type {Error | null} */ err, /** @type {any[]} */ rows) => {
          if (err) {
            return reject(err);
          }
          resolve(rows);
        }
      );
    });

    indexes.forEach((/** @type {any} */ index) => {
      const tableName = index.tbl_name;
      if (!stats.indexes[tableName]) {
        stats.indexes[tableName] = [];
      }
      stats.indexes[tableName].push(index.name);
    });

    return stats;
  }

  /**
   * 优化数据库
   */
  async optimize() {
    logger.info('开始数据库优化...');

    try {
      // 执行VACUUM
      await new Promise((/** @type {(value?: void) => void} */ resolve, reject) => {
        this.db.run('VACUUM', (/** @type {Error | null} */ err) => {
          if (err) {
            return reject(err);
          }
          logger.info('✅ VACUUM完成');
          resolve();
        });
      });

      // 重建索引
      await this.rebuildIndexes();

      logger.info('✅ 数据库优化完成');
    } catch (error) {
      logger.error('❌ 数据库优化失败:', error);
      throw error;
    }
  }

  /**
   * 重建索引
   */
  async rebuildIndexes() {
    // 获取所有索引
    const indexes = await new Promise((resolve, reject) => {
      this.db.all(
        "SELECT name, sql FROM sqlite_master WHERE type='index'",
        (/** @type {Error | null} */ err, /** @type {any[]} */ rows) => {
          if (err) {
            return reject(err);
          }
          resolve(rows);
        }
      );
    });

    // 删除索引
    const dropPromises = indexes.map((/** @type {any} */ index) => {
      return new Promise((/** @type {(value?: void) => void} */ resolve, reject) => {
        this.db.run(`DROP INDEX IF EXISTS ${index.name}`, (/** @type {Error | null} */ err) => {
          if (err) {
            return reject(err);
          }
          resolve();
        });
      });
    });

    await Promise.all(dropPromises);

    // 重新创建索引
    const createPromises = indexes.filter((/** @type {any} */ index) => index.sql).map((/** @type {any} */ index) => {
      return new Promise((/** @type {(value?: void) => void} */ resolve, reject) => {
        this.db.run(index.sql, (/** @type {Error | null} */ err) => {
          if (err) {
            return reject(err);
          }
          resolve();
        });
      });
    });

    await Promise.all(createPromises);
  }

  /**
   * 备份数据库
   * @param {string} backupPath - 备份路径
   * @returns {Promise<string>}
   */
  async backup(backupPath) {
    logger.info(`开始数据库备份到: ${backupPath}`);

    const fs = await import('fs');

    // 复制数据库文件
    await fs.promises.copyFile(
      process.env.DB_PATH || './ai_models.db',
      backupPath
    );

    logger.info('✅ 数据库备份完成');
    return backupPath;
  }
}

export default DatabaseService;
