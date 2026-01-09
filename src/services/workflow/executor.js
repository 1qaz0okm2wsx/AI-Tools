/**
 * 工作流执行器模块
 */

import { webConfigService } from '../webConfig.js';
import { ElementFinder } from '../element.js';
import { StreamMonitor } from '../streamMonitor/index.js';
import { extractorRegistry } from '../extractors/index.js';
import { logger } from '../../utils/logger.js';

export class WorkflowExecutor {
  constructor(page, stealthMode = false, stopChecker = null, extractor = null) {
    this.page = page;
    this.stealthMode = stealthMode;
    this.finder = new ElementFinder(page);
    this.shouldStop = stopChecker || (() => false);
    this.extractor = extractor || extractorRegistry.getDefault();

    this.completionId = this.generateId();

    logger.debug(`[WORKFLOW] 使用提取器: ${this.extractor.getId()}`);
  }

  generateId() {
    return `chatcmpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async executeStep(action, selector, targetKey, value, optional, context) {
    if (this.shouldStop()) {
      logger.debug(`步骤 ${action} 跳过（已取消）`);
      return;
    }

    logger.debug(`执行: ${action} -> ${targetKey}`);

    try {
      switch (action) {
        case 'WAIT':
          await this.executeWait(parseFloat(value) || 0.5);
          break;

        case 'KEY_PRESS':
          await this.executeKeypress(targetKey || value);
          break;

        case 'CLICK':
          await this.executeClick(selector, targetKey, optional);
          break;

        case 'FILL_INPUT':
          const prompt = context?.prompt || '';
          await this.executeFill(selector, prompt, targetKey, optional);
          break;

        case 'STREAM_WAIT':
        case 'STREAM_OUTPUT':
          const userInput = context?.prompt || '';
          await this.executeStream(selector, userInput);
          break;

        default:
          logger.debug(`未知动作: ${action}`);
      }
    } catch (error) {
      logger.error(`步骤执行失败 [${action}]: ${error.message}`);
      if (!optional) {
        throw error;
      }
    }
  }

  async executeWait(seconds) {
    const startTime = Date.now();
    const duration = seconds * 1000;

    while (Date.now() - startTime < duration) {
      if (this.shouldStop()) {
        return;
      }
      await this.delay(100);
    }
  }

  async executeKeypress(key) {
    if (this.shouldStop()) {
      return;
    }

    await this.page.keyboard.press(key);
    await this.smartDelay(0.1, 0.2);
  }

  async executeClick(selector, targetKey, optional) {
    if (this.shouldStop()) {
      return;
    }

    const element = await this.finder.findWithFallback(selector, targetKey);

    if (element) {
      try {
        if (this.stealthMode) {
          await this.simulateMouseMove(element);
        }

        if (this.shouldStop()) {
          return;
        }

        await element.click();
        await this.smartDelay(
          webConfigService.getBrowserConstant('ACTION_DELAY_MIN'),
          webConfigService.getBrowserConstant('ACTION_DELAY_MAX')
        );
      } catch (error) {
        logger.debug(`点击异常: ${error.message}`);
        if (targetKey === 'send_btn') {
          await this.executeKeypress('Enter');
        }
      }
    } else if (targetKey === 'send_btn') {
      await this.executeKeypress('Enter');
    } else if (!optional) {
      throw new Error(`点击目标未找到: ${selector}`);
    }
  }

  async executeFill(selector, text, targetKey, optional) {
    if (this.shouldStop()) {
      return;
    }

    const element = await this.finder.findWithFallback(selector, targetKey);
    if (!element) {
      if (!optional) {
        throw new Error('找不到输入框');
      }
      return;
    }

    // 清空输入框
    await this.clearInput(element);

    // 分块输入
    await this.chunkedInput(element, text);

    // 物理激活
    await this.physicalActivate(element);

    // 校验并修正
    await this.verifyAndFix(element, text);
  }

  async clearInput(element) {
    try {
      await element.click();
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('A');
      await this.page.keyboard.up('Control');
      await this.page.keyboard.press('Backspace');
    } catch (error) {
      logger.debug(`清空输入框失败: ${error.message}`);
    }
  }

  async chunkedInput(element, text) {
    const CHUNK_SIZE = 30000;
    const totalLen = text.length;

    if (totalLen <= CHUNK_SIZE) {
      logger.debug(`[CHUNKED_INPUT] 短文本模式: ${totalLen} 字符，直接写入`);
      await element.type(text, { delay: 10 });
    } else {
      logger.info(`[CHUNKED_INPUT] 长文本模式: ${totalLen} 字符，分块大小 ${CHUNK_SIZE}`);

      // 首块
      const firstChunk = text.slice(0, CHUNK_SIZE);
      await element.type(firstChunk, { delay: 10 });
      logger.debug(`[CHUNKED_INPUT] 首块完成: 0-${CHUNK_SIZE}`);
      await this.delay(100);

      // 后续块
      for (let i = CHUNK_SIZE; i < totalLen; i += CHUNK_SIZE) {
        if (this.shouldStop()) {
          logger.info('[CHUNKED_INPUT] 被取消');
          return false;
        }

        const endPos = Math.min(i + CHUNK_SIZE, totalLen);
        const chunk = text.slice(i, endPos);
        await element.type(chunk, { delay: 10 });
        logger.debug(`[CHUNKED_INPUT] 块完成: ${i}-${endPos}`);
        await this.delay(80);
      }

      logger.info(`[CHUNKED_INPUT] 全部完成: ${totalLen} 字符`);
    }

    return true;
  }

  async physicalActivate(element) {
    try {
      await element.focus();

      // 检测是否为 contenteditable
      const isContentEditable = await element.evaluate(el => {
        return el.isContentEditable || el.getAttribute('contenteditable') === 'true';
      });

      if (isContentEditable) {
        await this.page.keyboard.press('Space');
        await this.delay(30);
        await this.page.keyboard.press('Backspace');
      } else {
        await element.type(' ');
        await this.delay(30);
        await this.page.keyboard.press('Backspace');
      }

      await this.delay(100);
    } catch (error) {
      logger.debug(`物理激活异常（可忽略）: ${error.message}`);
    }
  }

  async verifyAndFix(element, originalText) {
    const expected = originalText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const expectedLen = expected.length;
    const expectedNormalized = this.normalizeForCompare(expected);
    const expectedCore = expected.replace(/\s+/g, '');

    // 检测是否为富文本编辑器
    const isRichEditor = await element.evaluate(el => {
      return el.isContentEditable || el.getAttribute('contenteditable') === 'true';
    });

    for (let attempt = 0; attempt < 3; attempt++) {
      const actual = await this.readInputFullText(element);

      // 检查1：精确匹配
      if (actual === expected) {
        logger.info(`[VERIFY_OK] attempt=${attempt} len=${actual.length} (exact match)`);
        return;
      }

      // 检查2：规范化匹配
      const actualNormalized = this.normalizeForCompare(actual);
      if (actualNormalized === expectedNormalized) {
        const diff = actual.length - expectedLen;
        logger.info(
          `[VERIFY_OK] attempt=${attempt} len=${actual.length} ` +
          `(normalized match, diff=${diff > 0 ? '+' : ''}${diff} chars)`
        );
        return;
      }

      // 检查3：富文本编辑器核心内容匹配
      if (isRichEditor) {
        const actualCore = actual.replace(/\s+/g, '');
        if (actualCore === expectedCore) {
          const diff = actual.length - expectedLen;
          logger.info(
            `[VERIFY_OK] attempt=${attempt} len=${actual.length} ` +
            `(rich editor core match, diff=${diff > 0 ? '+' : ''}${diff} chars)`
          );
          return;
        }
      }

      // 校验失败，尝试修复
      logger.warn(
        `[VERIFY_FAIL] attempt=${attempt} ` +
        `actual_len=${actual.length} expected_len=${expectedLen} is_rich=${isRichEditor}`
      );

      await this.clearInput(element);
      await this.delay(50);
      await element.type(expected, { delay: 10 });
      await this.delay(150);
    }

    // 最终检查
    const finalActual = await this.readInputFullText(element);
    const finalNormalized = this.normalizeForCompare(finalActual);

    if (finalNormalized === expectedNormalized) {
      logger.info('[VERIFY_OK] 最终检查通过 (normalized)');
      return;
    }

    if (isRichEditor) {
      const finalCore = finalActual.replace(/\s+/g, '');
      if (finalCore === expectedCore) {
        logger.info('[VERIFY_OK] 最终检查通过 (rich editor core match)');
        return;
      }
    }

    // 彻底失败
    logger.error(
      `[VERIFY_GIVEUP] 输入框内容仍不一致 ` +
      `(actual=${finalActual.length}, expected=${expectedLen}, is_rich=${isRichEditor})`
    );
    throw new Error('input_mismatch');
  }

  async readInputFullText(element) {
    try {
      const text = await element.evaluate(el => {
        const tag = el.tagName?.toLowerCase();
        if (tag === 'textarea' || tag === 'input') {
          return el.value || '';
        }
        if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
          return el.innerText || '';
        }
        return el.textContent || '';
      });
      return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    } catch (error) {
      return '';
    }
  }

  normalizeForCompare(text) {
    // 统一换行符
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // 将3+个连续换行压缩为2个
    text = text.replace(/\n{3,}/g, '\n\n');
    // 去除首尾空白
    return text.trim();
  }

  async executeStream(selector, userInput) {
    const monitor = new StreamMonitor(
      this.page,
      {
        packChunk: (content, id) => this.packChunk(content, id),
        packFinish: (id) => this.packFinish(id)
      },
      this.shouldStop
    );

    const chunks = monitor.monitor(selector, userInput, this.completionId);

    for await (const chunk of chunks) {
      // chunk 已经是格式化的 SSE 数据
    }
  }

  packChunk(content, completionId) {
    const data = {
      id: completionId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: 'web-browser',
      choices: [{
        index: 0,
        delta: { content },
        finish_reason: null
      }]
    };
    return `data: ${JSON.stringify(data)}\n\n`;
  }

  packFinish(completionId) {
    const data = {
      id: completionId,
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

  async simulateMouseMove(element) {
    try {
      const box = await element.boundingBox();
      if (!box) return;

      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;

      await this.page.mouse.move(x, y, { steps: 10 });
      await this.smartDelay(0.1, 0.25);
    } catch (error) {
      logger.debug(`模拟鼠标移动失败: ${error.message}`);
    }
  }

  async smartDelay(min, max) {
    if (!this.stealthMode) {
      return;
    }

    const minSec = min || webConfigService.getBrowserConstant('STEALTH_DELAY_MIN');
    const maxSec = max || webConfigService.getBrowserConstant('STEALTH_DELAY_MAX');
    const seconds = Math.random() * (maxSec - minSec) + minSec;

    await this.delay(seconds);
  }

  delay(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }
}