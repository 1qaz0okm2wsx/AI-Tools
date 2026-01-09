/**
 * 统一配置管理模块
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger.js';

// 默认配置
const DEFAULT_CONFIG = {
  // 使用模式：personal（个人模式，性能最大化）| service（服务模式，可调节）
  usage_mode: 'personal',

  // 数据库配置
  database: {
    path: './ai_models.db',
    pool: {
      maxConnections: 10,
      idleTimeout: 300000, // 5分钟
      acquireTimeout: 5000 // 5秒
    }
  },

  // 服务器配置
  server: {
    port: 3000,
    host: '0.0.0.0'
  },

  // 内存管理配置
  memory: {
    autoCleanup: true,
    cleanupInterval: 30000, // 30秒
    warningThreshold: 500, // MB
    gcEnabled: false
  },

  // 日志配置
  logging: {
    level: 'info',
    maxFiles: 10,
    maxSize: '10m',
    directory: './logs'
  },

  // API配置
  api: {
    timeout: 10000,
    maxRetries: 3,
    retryDelay: 1000
  },

  // 性能配置
  performance: {
    // 个人模式配置（性能最大化）
    personal: {
      rate_limit: {
        enabled: false,
        requests_per_minute: -1,
        requests_per_hour: -1
      },
      concurrent_requests: -1, // 无限制
      cache_enabled: false,
      cache_ttl: 0,
      circuit_breaker: {
        enabled: false,
        failure_threshold: 0,
        recovery_timeout: 0
      },
      max_tabs: -1, // 无限制
      session_isolation: false,
      max_retries: 10, // 更多重试
      retry_delay: 500 // 更快重试
    },
    // 服务模式配置（可调节）
    service: {
      rate_limit: {
        enabled: true,
        requests_per_minute: 60,
        requests_per_hour: 1000
      },
      concurrent_requests: 5,
      cache_enabled: true,
      cache_ttl: 300, // 5分钟
      circuit_breaker: {
        enabled: true,
        failure_threshold: 5,
        recovery_timeout: 60000 // 1分钟
      },
      max_tabs: 10,
      session_isolation: true,
      max_retries: 3,
      retry_delay: 1000
    }
  }
};

export class ConfigService {
  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.configPath = path.join(process.cwd(), 'config', 'app.json');
    this.environment = process.env.NODE_ENV || 'development';
  }

  /**
   * 加载配置
   */
  async load() {
    try {
      // 先加载基础配置，再加载环境覆盖配置
      const baseConfigPath = path.join(process.cwd(), 'config', 'app.json');
      const envConfigPath = path.join(process.cwd(), 'config', `app.${this.environment}.json`);

      const baseConfigData = await this.loadConfigFile(baseConfigPath);
      const envConfigData = await this.loadConfigFile(envConfigPath);

      // 合并配置：默认 < 基础 < 环境覆盖
      const withBase = this.mergeConfig(DEFAULT_CONFIG, baseConfigData);
      this.config = this.mergeConfig(withBase, envConfigData);

      // 应用环境变量覆盖
      this.applyEnvOverrides();

      logger.info(`[CONFIG] 配置已加载 (环境: ${this.environment})`);
      return this.config;
    } catch (/** @type {any} */ error) {
      logger.warn(`[CONFIG] 加载配置失败，使用默认值: ${error.message}`);
      this.config = { ...DEFAULT_CONFIG };
      this.applyEnvOverrides();
      return this.config;
    }
  }

  /**
   * 加载配置文件
   */
  async loadConfigFile(/** @type {string} */ filePath) {
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (/** @type {any} */ error) {
      if (error.code !== 'ENOENT') {
        logger.warn(`[CONFIG] 读取配置文件失败: ${error.message}`);
      }
      return {};
    }
  }

  /**
   * 合并配置
   */
  mergeConfig(/** @type {any} */ base, /** @type {any} */ override) {
    const result = { ...base };

    for (const key in override) {
      if (typeof override[key] === 'object' && !Array.isArray(override[key])) {
        result[key] = this.mergeConfig(base[key] || {}, override[key]);
      } else {
        result[key] = override[key];
      }
    }

    return result;
  }

  /**
   * 应用环境变量覆盖
   */
  applyEnvOverrides() {
    // 数据库配置
    if (process.env.DB_PATH) {
      this.config.database.path = process.env.DB_PATH;
    }
    if (process.env.DB_POOL_MAX) {
      this.config.database.pool.maxConnections = parseInt(process.env.DB_POOL_MAX, 10);
    }
    if (process.env.DB_POOL_IDLE_TIMEOUT) {
      this.config.database.pool.idleTimeout = parseInt(process.env.DB_POOL_IDLE_TIMEOUT, 10);
    }

    // 服务器配置
    if (process.env.PORT) {
      this.config.server.port = parseInt(process.env.PORT, 10);
    }
    if (process.env.HOST) {
      this.config.server.host = process.env.HOST;
    }

    // 内存配置
    if (process.env.MEMORY_CLEANUP_INTERVAL) {
      this.config.memory.cleanupInterval = parseInt(process.env.MEMORY_CLEANUP_INTERVAL, 10);
    }
    if (process.env.MEMORY_WARNING_THRESHOLD) {
      this.config.memory.warningThreshold = parseInt(process.env.MEMORY_WARNING_THRESHOLD, 10);
    }

    // 日志配置
    if (process.env.LOG_LEVEL) {
      this.config.logging.level = process.env.LOG_LEVEL;
    }

    // API配置
    if (process.env.API_TIMEOUT) {
      this.config.api.timeout = parseInt(process.env.API_TIMEOUT, 10);
    }
    if (process.env.API_MAX_RETRIES) {
      this.config.api.maxRetries = parseInt(process.env.API_MAX_RETRIES, 10);
    }
  }

  /**
   * 保存配置
   */
  async save() {
    try {
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });

      const configData = JSON.stringify(this.config, null, 2);
      await fs.writeFile(this.configPath, configData, 'utf-8');

      logger.info(`[CONFIG] 配置已保存: ${this.configPath}`);
    } catch (/** @type {any} */ error) {
      logger.error(`[CONFIG] 保存配置失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取配置值
   */
  get(/** @type {string} */ path) {
    const keys = path.split('.');
    /** @type {any} */
    let value = this.config;

    for (const key of keys) {
      if (value && typeof value === 'object') {
        value = value[key];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * 设置配置值
   */
  set(/** @type {string} */ path, /** @type {any} */ value) {
    const keys = path.split('.');
    /** @type {any} */
    let config = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!config[keys[i]]) {
        config[keys[i]] = {};
      }
      config = config[keys[i]];
    }

    config[keys[keys.length - 1]] = value;
  }

  /**
   * 获取数据库配置
   */
  getDatabaseConfig() {
    return this.config.database;
  }

  /**
   * 获取服务器配置
   */
  getServerConfig() {
    return this.config.server;
  }

  /**
   * 获取内存配置
   */
  getMemoryConfig() {
    return this.config.memory;
  }

  /**
   * 获取日志配置
   */
  getLoggingConfig() {
    return this.config.logging;
  }

  /**
   * 获取API配置
   */
  getApiConfig() {
    return this.config.api;
  }

  /**
   * 获取使用模式
   */
  getUsageMode() {
    return this.config.usage_mode || 'personal';
  }

  /**
   * 设置使用模式
   */
  setUsageMode(mode) {
    if (mode !== 'personal' && mode !== 'service') {
      throw new Error('无效的使用模式，必须是 personal 或 service');
    }
    this.config.usage_mode = mode;
  }

  /**
   * 获取性能配置
   */
  getPerformanceConfig() {
    const mode = this.getUsageMode();
    return this.config.performance[mode] || this.config.performance.personal;
  }

  /**
   * 获取限流配置
   */
  getRateLimitConfig() {
    const perfConfig = this.getPerformanceConfig();
    return perfConfig.rate_limit;
  }

  /**
   * 获取并发配置
   */
  getConcurrencyConfig() {
    const perfConfig = this.getPerformanceConfig();
    return {
      max_concurrent: perfConfig.concurrent_requests,
      session_isolation: perfConfig.session_isolation
    };
  }

  /**
   * 获取缓存配置
   */
  getCacheConfig() {
    const perfConfig = this.getPerformanceConfig();
    return {
      enabled: perfConfig.cache_enabled,
      ttl: perfConfig.cache_ttl
    };
  }

  /**
   * 获取熔断配置
   */
  getCircuitBreakerConfig() {
    const perfConfig = this.getPerformanceConfig();
    return perfConfig.circuit_breaker;
  }

  /**
   * 获取重试配置
   */
  getRetryConfig() {
    const perfConfig = this.getPerformanceConfig();
    return {
      max_retries: perfConfig.max_retries,
      retry_delay: perfConfig.retry_delay
    };
  }

  /**
   * 获取浏览器配置
   */
  getBrowserConfig() {
    const perfConfig = this.getPerformanceConfig();
    return {
      max_tabs: perfConfig.max_tabs,
      session_isolation: perfConfig.session_isolation
    };
  }

  /**
   * 获取环境
   */
  getEnvironment() {
    return this.environment;
  }

  /**
   * 验证配置
   */
  validate() {
    const errors = [];

    // 验证数据库配置
    if (!this.config.database.path) {
      errors.push('数据库路径不能为空');
    }
    if (this.config.database.pool.maxConnections < 1) {
      errors.push('数据库连接池最大连接数必须大于0');
    }
    if (this.config.database.pool.idleTimeout < 1000) {
      errors.push('数据库连接池空闲超时必须大于1秒');
    }

    // 验证服务器配置
    if (this.config.server.port < 1 || this.config.server.port > 65535) {
      errors.push('服务器端口必须在1-65535之间');
    }

    // 验证内存配置
    if (this.config.memory.warningThreshold < 100) {
      errors.push('内存警告阈值必须大于100MB');
    }

    if (errors.length > 0) {
      logger.error(`[CONFIG] 配置验证失败:`, errors);
      throw new Error(`配置验证失败: ${errors.join(', ')}`);
    }

    logger.info('[CONFIG] 配置验证通过');
    return true;
  }
}

// 导出单例
export default new ConfigService();
