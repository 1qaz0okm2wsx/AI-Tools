/**
 * 配置管理测试
 */

import { ConfigService } from '../../src/services/config/index.js';

describe('ConfigService', () => {
  let configService;
  let mockFs;

  beforeEach(() => {
    mockFs = {
      readFile: jest.fn().mockResolvedValue('{}'),
      writeFile: jest.fn().mockResolvedValue(undefined),
      mkdir: jest.fn().mockResolvedValue(undefined)
    };

    configService = new ConfigService();
  });

  test('应该正确初始化', () => {
    expect(configService.config).toBeDefined();
    expect(configService.configPath).toBeDefined();
    expect(configService.environment).toBe('development');
  });

  test('应该加载配置', async () => {
    jest.mock('fs/promises', () => mockFs);

    const config = await configService.load();

    expect(config).toBeDefined();
    expect(config.database).toBeDefined();
    expect(config.browser).toBeDefined();
    expect(config.server).toBeDefined();
  });

  test('应该获取配置值', () => {
    configService.config = {
      database: {
        path: './test.db'
      }
    };

    const dbPath = configService.get('database.path');

    expect(dbPath).toBe('./test.db');
  });

  test('应该设置配置值', () => {
    configService.config = {
      database: {
        path: './old.db'
      }
    };

    configService.set('database.path', './new.db');

    expect(configService.config.database.path).toBe('./new.db');
  });

  test('应该获取数据库配置', () => {
    configService.config = {
      database: {
        path: './test.db',
        pool: {
          maxConnections: 10
        }
      }
    };

    const dbConfig = configService.getDatabaseConfig();

    expect(dbConfig.path).toBe('./test.db');
    expect(dbConfig.pool.maxConnections).toBe(10);
  });

  test('应该获取浏览器配置', () => {
    configService.config = {
      browser: {
        pool: {
          maxInstances: 3
        }
      }
    };

    const browserConfig = configService.getBrowserConfig();

    expect(browserConfig.pool.maxInstances).toBe(3);
  });

  test('应该验证配置', () => {
    configService.config = {
      database: {
        path: './test.db',
        pool: {
          maxConnections: 10,
          idleTimeout: 300000
        }
      }
    };

    expect(() => configService.validate()).not.toThrow();
  });

  test('应该拒绝无效配置', () => {
    configService.config = {
      database: {
        path: '',
        pool: {
          maxConnections: 0
        }
      }
    };

    expect(() => configService.validate()).toThrow();
  });

  test('应该合并配置', () => {
    const base = {
      database: {
        path: './base.db'
      }
    };

    const override = {
      database: {
        pool: {
          maxConnections: 20
        }
      }
    };

    const merged = configService.mergeConfig(base, override);

    expect(merged.database.path).toBe('./base.db');
    expect(merged.database.pool.maxConnections).toBe(20);
  });

  test('应该应用环境变量覆盖', () => {
    process.env.DB_PATH = './env.db';
    process.env.PORT = '4000';

    configService.config = {
      database: {
        path: './default.db'
      },
      server: {
        port: 3000
      }
    };

    configService.applyEnvOverrides();

    expect(configService.config.database.path).toBe('./env.db');
    expect(configService.config.server.port).toBe(4000);

    // 清理环境变量
    delete process.env.DB_PATH;
    delete process.env.PORT;
  });
});
