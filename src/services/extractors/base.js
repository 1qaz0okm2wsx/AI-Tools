/**
 * 基础提取器模块
 */

import { logger } from '../../utils/logger.js';

export class BaseExtractor {
  constructor() {
    this.id = 'base';
    this.name = 'Base Extractor';
  }

  getId() {
    return this.id;
  }

  getName() {
    return this.name;
  }

  async extract(page, selector) {
    throw new Error('extract 方法必须被子类实现');
  }

  async extractMultiple(page, selector) {
    throw new Error('extractMultiple 方法必须被子类实现');
  }
}