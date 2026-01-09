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

  async extract(page, selector) {
    try {
      const result = await page.evaluate(sel => {
        const element = document.querySelector(sel);
        if (!element) {
          return { success: false, text: '', error: 'Element not found' };
        }

        return {
          success: true,
          text: element.innerText || element.textContent || '',
          html: element.outerHTML
        };
      }, selector);

      if (!result.success) {
        logger.warn(`[DOM] 提取失败: ${result.error}`);
        return null;
      }

      return result.text;
    } catch (error) {
      logger.error(`[DOM] 提取异常: ${error.message}`);
      return null;
    }
  }

  async extractMultiple(page, selector) {
    try {
      const results = await page.evaluate(sel => {
        const elements = document.querySelectorAll(sel);
        return Array.from(elements).map(el => ({
          text: el.innerText || el.textContent || '',
          html: el.outerHTML
        }));
      }, selector);

      return results.map(r => r.text);
    } catch (error) {
      logger.error(`[DOM] 批量提取异常: ${error.message}`);
      return [];
    }
  }
}