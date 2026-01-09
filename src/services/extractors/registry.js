/**
 * 提取器注册表模块
 */

import { BaseExtractor } from './base.js';
import { DOMExtractor } from './dom.js';
import { DeepBrowserExtractor } from './deep.js';
import { HybridExtractor } from './hybrid.js';
import { logger } from '../../utils/logger.js';

export class ExtractorRegistry {
  constructor() {
    this.extractors = new Map();
    this.defaultId = 'deep_mode';

    // 注册内置提取器
    this.register(new DOMExtractor());
    this.register(new DeepBrowserExtractor());
    this.register(new HybridExtractor());
  }

  register(extractor) {
    if (!(extractor instanceof BaseExtractor)) {
      throw new Error('提取器必须继承自 BaseExtractor');
    }

    this.extractors.set(extractor.getId(), extractor);
    logger.info(`[REGISTRY] 已注册提取器: ${extractor.getId()} - ${extractor.getName()}`);
  }

  unregister(id) {
    if (this.extractors.has(id)) {
      this.extractors.delete(id);
      logger.info(`[REGISTRY] 已注销提取器: ${id}`);
    }
  }

  get(id) {
    return this.extractors.get(id);
  }

  getDefault() {
    return this.get(this.defaultId);
  }

  setDefault(id) {
    if (!this.extractors.has(id)) {
      throw new Error(`提取器不存在: ${id}`);
    }

    this.defaultId = id;
    logger.info(`[REGISTRY] 默认提取器已设置为: ${id}`);
  }

  list() {
    return Array.from(this.extractors.values()).map(extractor => ({
      id: extractor.getId(),
      name: extractor.getName()
    }));
  }
}

// 导出单例
export const extractorRegistry = new ExtractorRegistry();