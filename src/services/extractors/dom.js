/**
 * DOM模式提取器模块
 */

import { BaseExtractor } from './base.js';
import { logger } from '../../utils/logger.js';

export class DOMExtractor extends BaseExtractor {
  constructor() {
    super();
    this.id = 'dom_mode';
    this.name = 'DOM Mode Extractor';
  }

  /**
   * @param {any} page
   * @param {string} selector
   * @returns {Promise<string | null>}
   */
  async extract(page, selector) {
    try {
      const result = await page.evaluate((/** @type {string} */ sel) => {
        // eslint-disable-next-line no-undef
        const element = document.querySelector(sel);
        if (!element) {
          return { success: false, text: '', error: 'Element not found' };
        }

        return {
          success: true,
          // @ts-ignore - Browser context code
          text: element.innerText || element.textContent || '',
          // @ts-ignore - Browser context code
          html: element.outerHTML
        };
      }, selector);

      if (!result.success) {
        logger.warn(`[DOM] 提取失败: ${result.error}`);
        return null;
      }

      return result.text;
    } catch (/** @type {any} */ error) {
      logger.error(`[DOM] 提取异常: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * @param {any} page
   * @param {string} selector
   * @returns {Promise<string[]>}
   */
  async extractMultiple(page, selector) {
    try {
      const results = await page.evaluate((/** @type {string} */ sel) => {
        // eslint-disable-next-line no-undef
        const elements = document.querySelectorAll(sel);
        return Array.from(elements).map(el => ({
          // @ts-ignore - Browser context code
          text: el.innerText || el.textContent || '',
          // @ts-ignore - Browser context code
          html: el.outerHTML
        }));
      }, selector);

      return results.map((/** @type {{ text: string }} */ r) => r.text);
    } catch (/** @type {any} */ error) {
      logger.error(`[DOM] 批量提取异常: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }
}