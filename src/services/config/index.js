/**
 * 统一配置管理模块
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 默认配置
const DEFAULT_CONFIG = {
  // 数据库配置
  database: {
    path: './ai_models.db',
    pool: {
      maxConnections: 10,
      idleTimeout: 300000, // 5分钟
      acquireTimeout: 5000 // 5秒
    }
  },

  // 浏览器配置
  browser: {
    enabled: true,
    pool: {
      maxInstances: 3,
      idleTimeout: 300000, // 5分钟
      acquireTimeout: 5000 // 5秒
    },
    constants: {
      DEFAULT_PORT: 9222,
      CONNECTION_TIMEOUT: 10,
      STEALTH_DELAY_MIN: 0.1,
      STEALTH_DELAY_MAX: 0.3,
      ACTION_DELAY_MIN: 0.15,
      ACTION_DELAY_MAX: 0.3,
      DEFAULT_ELEMENT_TIMEOUT: 3,
      FALLBACK_ELEMENT_TIMEOUT: 1,
      ELEMENT_CACHE_MAX_AGE: 5.0,
      STREAM_CHECK_INTERVAL_MIN: 0.1,
      STREAM_CHECK_INTERVAL_MAX: 1.0,
      STREAM_CHECK_INTERVAL_DEFAULT: 0.3,
      STREAM_SILENCE_THRESHOLD: 6.0,
      STREAM_MAX_TIMEOUT: 600,
      STREAM_INITIAL_WAIT: 180,
      STREAM_RERENDER_WAIT: 0.5,
      STREAM_CONTENT_SHRINK_TOLERANCE: 3,
      STREAM_MIN_VALID_LENGTH: 10,
      STREAM_STABLE_COUNT_THRESHOLD: 5,
      STREAM_SILENCE_THRESHOLD_FALLBACK: 10.0,
      MAX_MESSAGE_LENGTH: 100000,
      MAX_MESSAGES_COUNT: 100,
      STREAM_INITIAL_ELEMENT_WAIT: 10,
      STREAM_MAX_ABNORMAL_COUNT: 5,
      STREAM_MAX_ELEMENT_MISSING: 10,
      STREAM_CONTENT_SHRINK_THRESHOLD: 0.3,
      STREAM_USER_MSG_WAIT: 1.5,
      STREAM_PRE_BASELINE_DELAY: 0.3
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
    } catch (error) {
      logger.warn(`[CONFIG] 加载配置失败，使用默认值: ${error.message}`);
      this.config = { ...DEFAULT_CONFIG };
      return this.config;
    }
  }

  /**
   * 加载配置文件
   */
  async loadConfigFile(filePath) {
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.warn(`[CONFIG] 读取配置文件失败: ${error.message}`);
      }
      return {};
    }
  }

  /**
   * 合并配置
   */
  mergeConfig(base, override) {
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

    // 浏览器配置
    if (process.env.BROWSER_ENABLED) {
      const raw = String(process.env.BROWSER_ENABLED).toLowerCase();
      this.config.browser.enabled = !(raw === 'false' || raw === '0' || raw === 'off');
    }
    if (process.env.BROWSER_PORT) {
      this.config.browser.constants.DEFAULT_PORT = parseInt(process.env.BROWSER_PORT, 10);
    }
    if (process.env.BROWSER_POOL_MAX) {
      this.config.browser.pool.maxInstances = parseInt(process.env.BROWSER_POOL_MAX, 10);
    }
    if (process.env.BROWSER_POOL_IDLE_TIMEOUT) {
      this.config.browser.pool.idleTimeout = parseInt(process.env.BROWSER_POOL_IDLE_TIMEOUT, 10);
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
    } catch (error) {
      logger.error(`[CONFIG] 保存配置失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取配置值
   */
  get(path) {
    const keys = path.split('.');
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
  set(path, value) {
    const keys = path.split('.');
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
   * 获取浏览器配置
   */
  getBrowserConfig() {
    return this.config.browser;
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

    // 验证浏览器配置
    if (this.config.browser.pool.maxInstances < 1) {
      errors.push('浏览器实例池最大实例数必须大于0');
    }
    if (this.config.browser.pool.idleTimeout < 1000) {
      errors.push('浏览器实例池空闲超时必须大于1秒');
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
