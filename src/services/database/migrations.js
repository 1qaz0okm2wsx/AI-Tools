/**
 * 数据库迁移模块
 */

import { logger } from '../../utils/logger.js';

/**
 * 迁移管理器
 */
export class MigrationManager {
  constructor(db) {
    this.db = db;
    this.currentVersion = '1.0.0';
  }

  /**
   * 获取当前数据库版本
   */
  async getCurrentVersion() {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1',
        (err, row) => {
          if (err) {
            return reject(err);
          }
          resolve(row ? row.version : '1.0.0');
        }
      );
    });
  }

  /**
   * 执行迁移
   */
  async migrate() {
    const currentVersion = await this.getCurrentVersion();
    logger.info(`当前数据库版本: ${currentVersion}`);

    // 检查是否需要迁移
    if (this.needsMigration(currentVersion)) {
      logger.info('开始数据库迁移...');

      try {
        await this.createSchemaMigrationsTable();
        await this.runMigrations(currentVersion);
        await this.updateVersion(this.currentVersion);

        logger.info('✅ 数据库迁移完成');
      } catch (error) {
        logger.error('❌ 数据库迁移失败:', error);
        throw error;
      }
    } else {
      logger.info('数据库已是最新版本，无需迁移');
    }
  }

  /**
   * 检查是否需要迁移
   */
  needsMigration(currentVersion) {
    return currentVersion !== this.currentVersion;
  }

  /**
   * 创建迁移表
   */
  async createSchemaMigrationsTable() {
    return new Promise((resolve, reject) => {
      this.db.run(
        `CREATE TABLE IF NOT EXISTS schema_migrations (
          version TEXT PRIMARY KEY,
          applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          description TEXT
        )`,
        (err) => {
          if (err) {
            return reject(err);
          }
          resolve();
        }
      );
    });
  }

  /**
   * 运行迁移
   */
  async runMigrations(fromVersion) {
    const migrations = this.getMigrations();

    for (const migration of migrations) {
      if (migration.version > fromVersion) {
        logger.info(`执行迁移: ${migration.version} - ${migration.description}`);
        await migration.up();
      }
    }
  }

  /**
   * 获取所有迁移
   */
  getMigrations() {
    return [
      {
        version: '1.1.0',
        description: '优化api_keys表，添加last_used_at和use_count字段',
        up: async () => {
          await this.db.run(`
            ALTER TABLE api_keys ADD COLUMN last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP
          `);

          await this.db.run(`
            ALTER TABLE api_keys ADD COLUMN use_count INTEGER DEFAULT 0
          `);

          logger.info('✅ api_keys表优化完成');
        }
      },
      {
        version: '1.2.0',
        description: '优化api_endpoints表，添加last_used_at和use_count字段',
        up: async () => {
          await this.db.run(`
            ALTER TABLE api_endpoints ADD COLUMN last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP
          `);

          await this.db.run(`
            ALTER TABLE api_endpoints ADD COLUMN use_count INTEGER DEFAULT 0
          `);

          logger.info('✅ api_endpoints表优化完成');
        }
      },
      {
        version: '2.0.0',
        description: '优化providers表，添加is_primary字段和索引',
        up: async () => {
          await this.db.run(`
            ALTER TABLE providers ADD COLUMN is_primary BOOLEAN DEFAULT 1
          `);

          await this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_providers_is_primary ON providers(is_primary)
          `);

          logger.info('✅ providers表优化完成');
        }
      }
    ];
  }

  /**
   * 更新版本号
   */
  async updateVersion(version) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR REPLACE INTO schema_migrations (version, applied_at, description) VALUES (?, ?, ?)',
        [version, new Date().toISOString(), this.getMigrationDescription(version)],
        (err) => {
          if (err) {
            return reject(err);
          }
          resolve();
        }
      );
    });
  }

  /**
   * 获取迁移描述
   */
  getMigrationDescription(version) {
    const migration = this.getMigrations().find(m => m.version === version);
    return migration ? migration.description : '';
  }
}

export default MigrationManager;
