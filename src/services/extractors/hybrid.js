/**
 * 混合模式提取器模块
 */

import { BaseExtractor } from './base.js';
import { DOMExtractor } from './dom.js';
import { DeepBrowserExtractor } from './deep.js';

export class HybridExtractor extends BaseExtractor {
  constructor() {
    super();
    /** @type {string} */
    this.id = 'hybrid_mode';
    /** @type {string} */
    this.name = 'Hybrid Extractor';
    /** @type {DOMExtractor} */
    this.domExtractor = new DOMExtractor();
    /** @type {DeepBrowserExtractor} */
    this.deepExtractor = new DeepBrowserExtractor();
  }

  /**
   * @param {any} page
   * @param {string} selector
   * @returns {Promise<string | null>}
   */
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

  /**
   * @param {any} page
   * @param {string} selector
   * @returns {Promise<string[]>}
   */
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