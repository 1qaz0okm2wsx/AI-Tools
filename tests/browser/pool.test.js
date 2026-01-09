/**
 * 浏览器池测试
 */

import { BrowserPool } from '../../src/services/browser/pool.js';

describe('BrowserPool', () => {
  let pool;
  let mockBrowser;

  beforeEach(() => {
    mockBrowser = {
      close: jest.fn().mockResolvedValue(undefined),
      on: jest.fn()
    };

    pool = new BrowserPool(3);
  });

  afterEach(() => {
    pool.stopCleanup();
  });

  test('应该正确初始化', () => {
    expect(pool.maxInstances).toBe(3);
    expect(pool.pool).toBeDefined();
    expect(pool.activeConnections).toBeDefined();
    expect(pool.instanceCounter).toBe(0);
  });

  test('应该获取浏览器实例', async () => {
    // Mock puppeteer.connect
    jest.mock('puppeteer', () => ({
      connect: jest.fn().mockResolvedValue(mockBrowser)
    }));

    const instance = await pool.acquire();

    expect(instance).toBeDefined();
    expect(instance.id).toBeDefined();
    expect(pool.activeConnections.size).toBe(1);
  });

  test('应该释放浏览器实例', () => {
    const instanceId = 'browser-1';
    pool.activeConnections.set(instanceId, {
      acquiredAt: Date.now(),
      lastUsed: Date.now()
    });

    pool.release(instanceId);

    expect(pool.activeConnections.has(instanceId)).toBe(false);
  });

  test('应该清理空闲实例', async () => {
    // 添加一个超时的空闲实例
    const instanceId = 'browser-1';
    const oldTime = Date.now() - 400000; // 超过5分钟
    pool.pool.set(instanceId, {
      id: instanceId,
      browser: mockBrowser,
      createdAt: oldTime,
      lastUsed: oldTime
    });

    await pool.cleanupIdleInstances();

    expect(pool.pool.has(instanceId)).toBe(false);
  });

  test('应该获取池状态', () => {
    pool.pool.set('browser-1', {
      id: 'browser-1',
      browser: mockBrowser,
      createdAt: Date.now(),
      lastUsed: Date.now()
    });

    pool.activeConnections.set('browser-1', {
      acquiredAt: Date.now(),
      lastUsed: Date.now()
    });

    const status = pool.getStatus();

    expect(status.total).toBe(1);
    expect(status.active).toBe(1);
    expect(status.idle).toBe(0);
    expect(status.max).toBe(3);
    expect(status.instances).toHaveLength(1);
  });

  test('应该关闭所有实例', async () => {
    pool.pool.set('browser-1', {
      id: 'browser-1',
      browser: mockBrowser,
      createdAt: Date.now(),
      lastUsed: Date.now()
    });

    await pool.closeAll();

    expect(pool.pool.size).toBe(0);
    expect(mockBrowser.close).toHaveBeenCalled();
  });
});
