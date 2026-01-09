/**
 * 混合模式提取器模块
 */

import { BaseExtractor } from './base.js';
import { DOMExtractor } from './dom.js';
import { DeepBrowserExtractor } from './deep.js';
import { logger } from '../../utils/logger.js';

export class HybridExtractor extends BaseExtractor {
  constructor() {
    super();
    this.id = 'hybrid_mode';
    this.name = 'Hybrid Extractor';
    this.domExtractor = new DOMExtractor();
    this.deepExtractor = new DeepBrowserExtractor();
  }

  async extract(page, selector) {
    // 先尝试DOM模式
    let result = await this.domExtractor.extract(page, selector);

    if (result && result.length > 0) {
      return result;
    }

    // DOM模式失败，尝试深度模式
    result = await this.deepExtractor.extract(page, selector);
    return result;
  }

  async extractMultiple(page, selector) {
    // 先尝试DOM模式
    let results = await this.domExtractor.extractMultiple(page, selector);

    if (results.length > 0) {
      return results;
    }

    // DOM模式失败，尝试深度模式
    results = await this.deepExtractor.extractMultiple(page, selector);
    return results;
  }
}