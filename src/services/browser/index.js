/**
 * 浏览器服务主入口
 */

import { BrowserConnection } from './connection.js';
import { BrowserWorkflow } from './workflow.js';

class BrowserService {
  constructor() {
    this.connection = new BrowserConnection();
    this.workflow = new BrowserWorkflow(this.connection);
  }

  async initialize() {
    return this.connection.initialize();
  }

  async healthCheck() {
    return this.connection.healthCheck();
  }

  getPage() {
    return this.connection.getPage();
  }

  /**
   * @param {() => boolean} checker - 停止检查函数
   */
  setStopChecker(checker) {
    this.workflow.setStopChecker(checker);
  }

  isStopped() {
    return this.workflow.isStopped();
  }

  /**
   * @param {any[]} messages - 消息列表
   * @param {boolean} stream - 是否使用流式传输
   * @returns {AsyncGenerator<any, void, unknown>}
   */
  async *executeWorkflow(messages, stream = true) {
    // @ts-ignore - workflow.executeWorkflow may accept 2 arguments
    yield* this.workflow.executeWorkflow(messages, stream);
  }

  async close() {
    return this.connection.close();
  }
}

// 导出单例
export const browserService = new BrowserService();