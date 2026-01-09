/**
 * 数据库池测试
 */

import { DatabasePool } from '../../src/services/database/pool.js';

describe('DatabasePool', () => {
  let pool;
  let mockDb;

  beforeEach(() => {
    mockDb = {
      configure: jest.fn(),
      close: jest.fn((callback) => {
        if (callback) {
          callback(null);
        }
      })
    };

    pool = new DatabasePool(':memory:', {
      maxConnections: 3,
      idleTimeout: 60000,
      acquireTimeout: 5000
    });
  });

  afterEach(() => {
    pool.stopCleanup();
  });

  test('应该正确初始化', () => {
    expect(pool.options.maxConnections).toBe(3);
    expect(pool.options.idleTimeout).toBe(60000);
    expect(pool.options.acquireTimeout).toBe(5000);
    expect(pool.pool).toBeDefined();
    expect(pool.activeConnections).toBeDefined();
  });

  test('应该创建新连接', async () => {
    jest.mock('sqlite3', () => ({
      Database: jest.fn().mockImplementation(() => mockDb)
    }));

    const connection = await pool.createConnection();

    expect(connection).toBeDefined();
    expect(connection.id).toBeDefined();
    expect(connection.db).toBeDefined();
    expect(pool.pool.size).toBe(1);
  });

  test('应该获取连接', async () => {
    pool.pool.set('db-conn-1', {
      id: 'db-conn-1',
      db: mockDb,
      createdAt: Date.now(),
      lastUsed: Date.now()
    });

    const connection = await pool.acquire();

    expect(connection.id).toBe('db-conn-1');
    expect(pool.activeConnections.has('db-conn-1')).toBe(true);
  });

  test('应该释放连接', () => {
    pool.activeConnections.set('db-conn-1', {
      acquiredAt: Date.now(),
      lastUsed: Date.now()
    });

    pool.release('db-conn-1');

    expect(pool.activeConnections.has('db-conn-1')).toBe(false);
  });

  test('应该清理空闲连接', async () => {
    // 添加一个超时的空闲连接
    const oldTime = Date.now() - 70000; // 超过60秒
    pool.pool.set('db-conn-1', {
      id: 'db-conn-1',
      db: mockDb,
      createdAt: oldTime,
      lastUsed: oldTime
    });

    await pool.cleanupIdleConnections();

    expect(pool.pool.has('db-conn-1')).toBe(false);
  });

  test('应该获取池状态', () => {
    pool.pool.set('db-conn-1', {
      id: 'db-conn-1',
      db: mockDb,
      createdAt: Date.now(),
      lastUsed: Date.now()
    });

    pool.activeConnections.set('db-conn-1', {
      acquiredAt: Date.now(),
      lastUsed: Date.now()
    });

    const status = pool.getStatus();

    expect(status.total).toBe(1);
    expect(status.active).toBe(1);
    expect(status.idle).toBe(0);
    expect(status.max).toBe(3);
    expect(status.connections).toHaveLength(1);
  });

  test('应该关闭所有连接', async () => {
    pool.pool.set('db-conn-1', {
      id: 'db-conn-1',
      db: mockDb,
      createdAt: Date.now(),
      lastUsed: Date.now()
    });

    await pool.closeAll();

    expect(pool.pool.size).toBe(0);
    expect(mockDb.close).toHaveBeenCalled();
  });
});
