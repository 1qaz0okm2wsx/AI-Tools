import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger.js';

class BrowserConfigLoader {
  constructor() {
    this.config = null;
    this.configPath = path.join(process.cwd(), 'config', 'browser-performance-max.json');
  }

  async load() {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(data);
      logger.info('[BROWSER-CONFIG] 浏览器性能配置已加载');
      return this.config;
    } catch (error) {
      logger.error('[BROWSER-CONFIG] 加载配置失败:', error);
      return null;
    }
  }

  getBrowserConfig() {
    return this.config?.browser || null;
  }

  getBrowserConstants() {
    return this.config?.browser?.constants || null;
  }

  getBrowserPoolConfig() {
    return this.config?.browser?.pool || null;
  }
}

export default new BrowserConfigLoader();
