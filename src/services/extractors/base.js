/**
 * 基础提取器模块
 */

export class BaseExtractor {
  constructor() {
    /** @type {string} */
    this.id = 'base';
    /** @type {string} */
    this.name = 'Base Extractor';
  }

  /**
   * @returns {string}
   */
  getId() {
    return this.id;
  }

  /**
   * @returns {string}
   */
  getName() {
    return this.name;
  }

  /**
   * @param {any} _page
   * @param {any} _selector
   * @returns {Promise<any>}
   */
  async extract(_page, _selector) {
    throw new Error('extract 方法必须被子类实现');
  }

  /**
   * @param {any} _page
   * @param {any} _selector
   * @returns {Promise<any>}
   */
  async extractMultiple(_page, _selector) {
    throw new Error('extractMultiple 方法必须被子类实现');
  }
}