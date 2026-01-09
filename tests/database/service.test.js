/**
 * 数据库服务测试
 */

import { DatabaseService } from '../../src/services/database/index.js';

describe('DatabaseService', () => {
  let dbService;
  let mockDb;
  let mockMigrationManager;

  beforeEach(() => {
    mockMigrationManager = {
      migrate: jest.fn().mockResolvedValue(undefined)
    };

    mockDb = {
      all: jest.fn((sql, params, callback) => {
        if (sql.includes('SELECT name FROM sqlite_master')) {
          // 返回表列表
          if (callback) {
            callback(null, [
              { name: 'providers' },
              { name: 'api_keys' },
              { name: 'models' }
            ]);
          }
        }
      }),
      get: jest.fn((sql, params, callback) => {
        if (sql.includes('SELECT COUNT(*)')) {
          if (callback) {
            callback(null, { count: 10 });
          }
        }
      }),
      run: jest.fn((sql, params, callback) => {
        if (callback) {
          callback(null);
        }
      })
    };

    dbService = new DatabaseService(mockDb);
    dbService.migrationManager = mockMigrationManager;
  });

test('应该正确初始化', () => {
  expect(dbService.db).toBe(mockDb);
  expect(dbService.migrationManager).toBe(mockMigrationManager);
});

test('应该获取数据库统计', async () => {
  const stats = await dbService.getStats();

  expect(stats).toHaveProperty('tables');
  expect(stats.tables).toHaveProperty('providers');
  expect(stats.tables).toHaveProperty('api_keys');
  expect(stats.tables).toHaveProperty('models');
  expect(stats.tables.providers.row_count).toBe(10);
  expect(stats.tables.api_keys.row_count).toBe(5);
  expect(stats.tables.models.row_count).toBe(3);

  expect(stats).toHaveProperty('indexes');
  expect(stats.indexes).toBeDefined();
});

test('应该优化数据库', async () => {
  await dbService.optimize();

  expect(mockDb.run).toHaveBeenCalledWith('VACUUM');
});

test('应该备份数据库', async () => {
  const backupPath = './backups/test_backup.db';
  const result = await dbService.backup(backupPath);

  expect(result).toBe(backupPath);
});
