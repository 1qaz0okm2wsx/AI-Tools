/**
 * 数据库迁移测试
 */

import { MigrationManager } from '../../src/services/database/migrations.js';

describe('MigrationManager', () => {
  let migrationManager;
  let mockDb;

  beforeEach(() => {
    mockDb = {
      run: jest.fn((sql, params, callback) => {
        // 默认不执行任何操作
        if (callback) {
          callback(null);
        }
      }),
      get: jest.fn((sql, params, callback) => {
        if (sql.includes('SELECT version')) {
          // 返回当前版本
          if (callback) {
            callback(null, { version: '1.0.0' });
          }
        } else {
          if (callback) {
            callback(null);
          }
        }
      }),
      all: jest.fn((sql, params, callback) => {
        if (callback) {
          callback(null, []);
        }
      })
    };

    migrationManager = new MigrationManager(mockDb);
  });

  test('应该正确初始化', () => {
    expect(migrationManager.db).toBe(mockDb);
    expect(migrationManager.currentVersion).toBe('1.0.0');
  });

test('应该获取当前版本', async () => {
  const version = await migrationManager.getCurrentVersion();
  expect(version).toBe('1.0.0');
});

test('应该检测需要迁移', () => {
  expect(migrationManager.needsMigration('1.0.0')).toBe(false);
  expect(migrationManager.needsMigration('0.9.0')).toBe(true);
});

test('应该创建迁移表', async () => {
  await migrationManager.createSchemaMigrationsTable();
  expect(mockDb.run).toHaveBeenCalledWith(
    expect.stringContaining('CREATE TABLE IF NOT EXISTS schema_migrations')
  );
});

test('应该执行迁移', async () => {
  mockDb.run.mockImplementation((sql, params, callback) => {
    // 记录执行的SQL
    if (sql.includes('INSERT INTO schema_migrations')) {
      if (callback) {
        callback(null);
      }
    }
  });

  await migrationManager.runMigrations('1.0.0');

  // 验证执行了迁移
  expect(mockDb.run).toHaveBeenCalledTimes(3); // 3个迁移
});

test('应该更新版本', async () => {
  await migrationManager.updateVersion('2.0.0');

  expect(mockDb.run).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO schema_migrations'),
    expect.stringContaining('2.0.0')
  );
});
});
