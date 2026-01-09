/**
 * 元素查找和缓存模块
 */

import { webConfigService } from './webConfig.js';
import { logger } from '../utils/logger.js';

class CachedElement {
  constructor(element, selector, cachedAt, contentHash) {
    this.element = element;
    this.selector = selector;
    this.cachedAt = cachedAt;
    this.contentHash = contentHash;
  }

  isStale(maxAge) {
    const age = Date.now() / 1000 - this.cachedAt;
    const maxAgeSeconds = maxAge || webConfigService.getBrowserConstant('ELEMENT_CACHE_MAX_AGE') || 5.0;
    return age > maxAgeSeconds;
  }
}

class ElementFinder {
  constructor(page) {
    this.page = page;
    this.cache = new Map();

    // 回退选择器配置
    this.fallbackSelectors = {
      input_box: [
        'textarea',
        'textarea[name="message"]',
        'textarea[placeholder]',
        'div[contenteditable="true"]',
        '[contenteditable="true"]'
      ],
      send_btn: [
        'button[type="submit"]',
        'form button[type="submit"]',
        '[role="button"][type="submit"]'
      ],
      result_container: [
        'div[class*="message"]',
        'div[class*="response"]',
        'div[class*="answer"]'
      ]
    };
  }

  async computeElementHash(element) {
    try {
      const identityParts = [];
      const stableAttrs = ['id', 'data-testid', 'data-message-id', 'data-turn-id'];

      for (const attr of stableAttrs) {
        const value = await element.evaluate((el, attr) => el.getAttribute(attr), attr);
        if (value) {
          identityParts.push(`${attr}=${value}`);
        }
      }

      const tag = await element.evaluate(el => el.tagName);
      identityParts.push(`tag=${tag}`);

      const classes = await element.evaluate(el => {
        const cls = el.className;
        return cls ? cls.split(' ').slice(0, 2).join('.') : '';
      });
      if (classes) {
        identityParts.push(`cls=${classes}`);
      }

      if (identityParts.length === 0) {
        return '';
      }

      const identityStr = identityParts.join('|');
      return this.hashString(identityStr);
    } catch (error) {
      return '';
    }
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).slice(0, 8);
  }

  async validateCachedElement(cached) {
    if (cached.isStale()) {
      return false;
    }

    try {
      const isVisible = await cached.element.isIntersectingViewport();
      if (!isVisible) {
        return false;
      }

      const currentHash = await this.computeElementHash(cached.element);
      if (cached.contentHash && currentHash !== cached.contentHash) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  async find(selector, timeout) {
    const DEFAULT_TIMEOUT = (webConfigService.getBrowserConstant('DEFAULT_ELEMENT_TIMEOUT') || 3) * 1000;
    const timeoutMs = timeout || DEFAULT_TIMEOUT;

    // 检查缓存
    if (this.cache.has(selector)) {
      const cached = this.cache.get(selector);
      if (await this.validateCachedElement(cached)) {
        return cached.element;
      } else {
        this.cache.delete(selector);
      }
    }

    // 查找元素
    let element;
    try {
      element = await this.page.waitForSelector(selector, { timeout: timeoutMs });
    } catch (error) {
      return null;
    }

    // 缓存有效元素
    if (element) {
      const contentHash = await this.computeElementHash(element);
      this.cache.set(selector, new CachedElement(
        element,
        selector,
        Date.now() / 1000,
        contentHash
      ));
    }

    return element;
  }

  async findAll(selector, timeout) {
    const DEFAULT_TIMEOUT = (webConfigService.getBrowserConstant('DEFAULT_ELEMENT_TIMEOUT') || 3) * 1000;
    const timeoutMs = timeout || DEFAULT_TIMEOUT;

    try {
      return await this.page.$$(selector);
    } catch (error) {
      return [];
    }
  }

  async findWithFallback(primarySelector, targetKey, timeout) {
    const DEFAULT_TIMEOUT = (webConfigService.getBrowserConstant('DEFAULT_ELEMENT_TIMEOUT') || 3) * 1000;
    const timeoutMs = timeout || DEFAULT_TIMEOUT;

    // 先尝试主选择器
    if (primarySelector) {
      const element = await this.find(primarySelector, timeoutMs);
      if (element) {
        return element;
      }
    }

    // 回退选择器
    const fallbackList = this.fallbackSelectors[targetKey] || [];
    if (fallbackList.length === 0) {
      return null;
    }

    logger.debug(`主选择器失败，尝试回退: ${targetKey}`);

    const FALLBACK_TIMEOUT = (webConfigService.getBrowserConstant('FALLBACK_ELEMENT_TIMEOUT') || 1) * 1000;
    for (const fbSelector of fallbackList) {
      const element = await this.find(fbSelector, FALLBACK_TIMEOUT);
      if (element) {
        logger.debug(`回退选择器成功: ${fbSelector}`);
        return element;
      }
    }

    return null;
  }

  clearCache() {
    this.cache.clear();
  }

  removeFromCache(selector) {
    this.cache.delete(selector);
  }
}

export { ElementFinder, CachedElement };