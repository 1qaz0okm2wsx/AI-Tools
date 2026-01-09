/**
 * 深度模式提取器模块
 */

import { BaseExtractor } from './base.js';
import { logger } from '../../utils/logger.js';

export class DeepBrowserExtractor extends BaseExtractor {
  constructor() {
    super();
    this.id = 'deep_mode';
    this.name = 'Deep Browser Extractor';
  }

  async extract(page, selector) {
    try {
      const result = await page.evaluate(sel => {
        const element = document.querySelector(sel);
        if (!element) {
          return { success: false, text: '', error: 'Element not found' };
        }

        // 提取文本内容，包括子元素
        const getTextContent = (node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent;
          }

          if (node.nodeType === Node.ELEMENT_NODE) {
            const tagName = node.tagName.toLowerCase();
            // 跳过脚本和样式
            if (['script', 'style', 'noscript'].includes(tagName)) {
              return '';
            }

            return Array.from(node.childNodes)
              .map(child => getTextContent(child))
              .join('');
          }

          return '';
        };

        return {
          success: true,
          text: getTextContent(element),
          html: element.outerHTML
        };
      }, selector);

      if (!result.success) {
        logger.warn(`[DEEP] 提取失败: ${result.error}`);
        return null;
      }

      return result.text;
    } catch (error) {
      logger.error(`[DEEP] 提取异常: ${error.message}`);
      return null;
    }
  }

  async extractMultiple(page, selector) {
    try {
      const results = await page.evaluate(sel => {
        const elements = document.querySelectorAll(sel);
        const getTextContent = (node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent;
          }

          if (node.nodeType === Node.ELEMENT_NODE) {
            const tagName = node.tagName.toLowerCase();
            if (['script', 'style', 'noscript'].includes(tagName)) {
              return '';
            }

            return Array.from(node.childNodes)
              .map(child => getTextContent(child))
              .join('');
          }

          return '';
        };

        return Array.from(elements).map(el => ({
          text: getTextContent(el),
          html: el.outerHTML
        }));
      }, selector);

      return results.map(r => r.text);
    } catch (error) {
      logger.error(`[DEEP] 批量提取异常: ${error.message}`);
      return [];
    }
  }
}