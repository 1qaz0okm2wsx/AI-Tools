/**
 * 浏览器工作流模块
 */

import { WorkflowExecutor } from '../workflow/index.js';
import { extractorRegistry } from '../extractors/index.js';
import { webConfigService } from '../webConfig.js';
import { logger } from '../../utils/logger.js';

export class BrowserWorkflow {
  /**
   * @param {any} connection
   */
  constructor(connection) {
    this.connection = connection;
    /** @type {(() => boolean) | null} */
    this.shouldStop = null;
  }

  /**
   * @param {() => boolean} checker
   */
  setStopChecker(checker) {
    this.shouldStop = checker;
  }

  isStopped() {
    return this.shouldStop ? this.shouldStop() : false;
  }

  /**
   * @param {any[]} messages
   * @param {boolean} stream
   */
  async *executeWorkflow(messages, stream = true) {
    const page = this.connection.getPage();

    // 验证输入
    const { isValid, error, sanitized } = this.validateMessages(messages);
    if (!isValid) {
      yield this.packError(`无效请求: ${error}`, 'invalid_request_error', 'invalid_messages');
      yield this.packFinish();
      return;
    }

    // 获取当前页面域名
    const url = page.url();
    const domain = url.split('//')[1]?.split('/')[0] || '';

    // 检查页面状态
    const pageStatus = await this.checkPageStatus(page);
    if (!pageStatus.ready) {
      yield this.packError(`页面未就绪: ${pageStatus.reason}`, 'page_not_ready', 'page_not_ready');
      yield this.packFinish();
      return;
    }

    // 获取站点配置
    const siteConfig = webConfigService.getSiteConfig(domain);
    if (!siteConfig) {
      yield this.packError('配置加载失败', 'config_error', 'config_error');
      yield this.packFinish();
      return;
    }

    // 获取提取器
    const extractorId = siteConfig.extractor_id || null;
    const extractor = extractorId ? 
      extractorRegistry.get(extractorId) :
      extractorRegistry.getDefault();

    // 执行工作流
    const workflow = siteConfig.workflow || [];
    const selectors = siteConfig.selectors || {};
    const stealth = siteConfig.stealth || false;

    // 创建工作流执行器
    const executor = new WorkflowExecutor(
      page,
      stealth,
      /** @type {any} */ (this.shouldStop) || undefined,
      extractor
    );

    const context = {
      prompt: messages.map((/** @type {any} */ m) => `${m.role}: ${m.content}`).join('\n\n')
    };

    try {
      for (const step of workflow) {
        if (this.isStopped()) {
          logger.info('工作流被用户中断');
          break;
        }

        const action = step.action;
        const target = step.target;
        const value = step.value;
        const optional = step.optional || false;
        const selector = selectors[target] || '';

        await executor.executeStep(action, selector, target, value, optional, context);
      }

      yield this.packFinish();
    } catch (error) {
      logger.error(`工作流执行错误: ${/** @type {Error} */ (error).message}`);
      yield this.packError(`执行错误: ${/** @type {Error} */ (error).message}`, 'execution_error', 'workflow_failed');
      yield this.packFinish();
    }
  }

  /**
   * @param {any[]} messages
   */
  validateMessages(messages) {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return {
        isValid: false,
        error: 'messages 不能为空',
        sanitized: null
      };
    }

    const MAX_MESSAGES_COUNT = webConfigService.getBrowserConstant('MAX_MESSAGES_COUNT') || 100;
    const MAX_MESSAGE_LENGTH = webConfigService.getBrowserConstant('MAX_MESSAGE_LENGTH') || 100000;

    if (messages.length > MAX_MESSAGES_COUNT) {
      return {
        isValid: false,
        error: `消息数量超过限制 (${MAX_MESSAGES_COUNT})`,
        sanitized: null
      };
    }

    const VALID_ROLES = ['user', 'assistant', 'system'];
    const sanitized = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (!msg || typeof msg !== 'object') {
        return {
          isValid: false,
          error: `messages[${i}] 不是对象类型`,
          sanitized: null
        };
      }

      const role = VALID_ROLES.includes(msg.role) ? msg.role : 'user';
      let content = msg.content || '';

      if (typeof content !== 'string') {
        content = String(content || '');
      }

      if (content.length > MAX_MESSAGE_LENGTH) {
        return {
          isValid: false,
          error: `messages[${i}].content 超过长度限制 (${MAX_MESSAGE_LENGTH})`,
          sanitized: null
        };
      }

      sanitized.push({ role, content });
    }

    return { isValid: true, error: null, sanitized };
  }

  /**
   * @param {any} page
   */
  async checkPageStatus(page) {
    /** @type {{ready: boolean, reason: string | null}} */
    const result = { ready: true, reason: null };

    try {
      const url = page.url();

      if (!url || url === 'about:blank' || url === 'chrome://newtab/') {
        result.ready = false;
        result.reason = '请先打开目标AI网站';
        return result;
      }

      const errorIndicators = ['chrome-error://', 'about:neterror'];
      for (const indicator of errorIndicators) {
        if (url.includes(indicator)) {
          result.ready = false;
          result.reason = '页面加载错误';
          return result;
        }
      }

      const title = await page.title();
      const warningKeywords = ['404', 'not found', 'error', '无法访问', 'refused'];
      for (const keyword of warningKeywords) {
        if (title.toLowerCase().includes(keyword)) {
          logger.debug(`页面可能存在问题: ${title}`);
          break;
        }
      }
    } catch (error) {
      logger.debug(`页面状态检查异常: ${/** @type {Error} */ (error).message}`);
    }

    return result;
  }

  /**
   * @param {string} message
   * @param {string} errorType
   * @param {string} code
   */
  packError(message, errorType = 'execution_error', code = 'workflow_failed') {
    const data = {
      error: {
        message,
        type: errorType,
        code
      }
    };
    return `data: ${JSON.stringify(data)}\n\n`;
  }

  packFinish() {
    const data = {
      id: this.generateId(),
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: 'web-browser',
      choices: [{
        index: 0,
        delta: {},
        finish_reason: 'stop'
      }]
    };
    return `data: ${JSON.stringify(data)}\n\ndata: [DONE]\n\n`;
  }

  generateId() {
    return `chatcmpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}