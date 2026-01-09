/**
 * Web配置服务模块 - 用于浏览器自动化站点配置
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 浏览器常量默认值
const DEFAULT_BROWSER_CONSTANTS = {
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
};

class WebConfigService {
  constructor() {
    this.sites = new Map();
    this.browserConstants = { ...DEFAULT_BROWSER_CONSTANTS };
    this.configPath = path.join(process.cwd(), 'config', 'sites.json');
    this.browserConfigPath = path.join(process.cwd(), 'config', 'browser_config.json');
  }

  async load() {
    try {
      // 加载站点配置
      const sitesData = await fs.readFile(this.configPath, 'utf-8');
      const sites = JSON.parse(sitesData);

      this.sites.clear();
      for (const [domain, config] of Object.entries(sites)) {
        this.sites.set(domain, config);
      }

      logger.info(`[CONFIG] 已加载 ${this.sites.size} 个站点配置`);
    } catch (error) {
      logger.warn(`[CONFIG] 加载站点配置失败: ${/** @type {Error} */ (error).message}`);
      this.sites.clear();
    }

    try {
      // 加载浏览器配置
      const browserConfig = await fs.readFile(this.browserConfigPath, 'utf-8');
      const constants = JSON.parse(browserConfig);

      this.browserConstants = { ...DEFAULT_BROWSER_CONSTANTS, ...constants };
      logger.info(`[CONFIG] 已加载浏览器配置`);
    } catch (error) {
      logger.warn(`[CONFIG] 加载浏览器配置失败，使用默认值: ${/** @type {Error} */ (error).message}`);
      this.browserConstants = { ...DEFAULT_BROWSER_CONSTANTS };
    }
  }

  /**
   * @param {string} domain
   */
  getSiteConfig(domain) {
    return this.sites.get(domain);
  }

  getAllSites() {
    return Object.fromEntries(this.sites);
  }

  /**
   * @param {string} domain
   * @param {any} config
   */
  async saveSiteConfig(domain, config) {
    this.sites.set(domain, config);

    const sitesData = JSON.stringify(Object.fromEntries(this.sites), null, 2);
    await fs.writeFile(this.configPath, sitesData, 'utf-8');

    logger.info(`[CONFIG] 已保存站点配置: ${domain}`);
  }

  /**
   * @param {string} domain
   */
  async deleteSiteConfig(domain) {
    if (this.sites.has(domain)) {
      this.sites.delete(domain);

      const sitesData = JSON.stringify(Object.fromEntries(this.sites), null, 2);
      await fs.writeFile(this.configPath, sitesData, 'utf-8');

      logger.info(`[CONFIG] 已删除站点配置: ${domain}`);
      return true;
    }
    return false;
  }

  /**
   * @param {string} key
   */
  getBrowserConstant(key) {
    return /** @type {any} */ (this.browserConstants)[key];
  }

  getAllBrowserConstants() {
    return { ...this.browserConstants };
  }

  /**
   * @param {any} constants
   */
  async saveBrowserConstants(constants) {
    this.browserConstants = { ...DEFAULT_BROWSER_CONSTANTS, ...constants };

    const configData = JSON.stringify(this.browserConstants, null, 2);
    await fs.writeFile(this.browserConfigPath, configData, 'utf-8');

    logger.info(`[CONFIG] 已保存浏览器配置`);
  }
}

// 导出单例
export const webConfigService = new WebConfigService();