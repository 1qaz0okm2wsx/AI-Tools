/**
 * 流式监听器模块
 */

import { webConfigService } from '../webConfig.js';
import { logger } from '../../utils/logger.js';
import { StreamContext } from './context.js';
import { GeneratingStatusCache } from './statusCache.js';

export class StreamMonitor {
  constructor(page, formatter, stopChecker = null) {
    this.page = page;
    this.formatter = formatter;
    this.shouldStop = stopChecker || (() => false);
    this.streamCtx = null;
    this.finalCompleteText = '';
    this.generatingChecker = null;
    this.HARD_TIMEOUT = 300; // 5分钟绝对上限
    this.BASELINE_POLLUTION_THRESHOLD = 20;
  }

  async *monitor(selector, userInput = '', completionId = null) {
    logger.info('========== 流式监听启动 ==========');
    logger.debug(`[MONITOR] selector_raw=${selector}`);

    if (!completionId) {
      completionId = this.generateId();
    }

    const ctx = new StreamContext();
    this.streamCtx = ctx;
    this.generatingChecker = new GeneratingStatusCache(this.page);

    // 阶段0：instant baseline
    ctx.instantBaseline = await this.getLatestMessageSnapshot(selector);
    ctx.instantLastNodeLen = ctx.instantBaseline.textLen || 0;

    logger.debug(
      `[Instant] count=${ctx.instantBaseline.groupsCount}, ` +
      `last_node_len=${ctx.instantLastNodeLen}`
    );

    // 阶段1：等待用户消息上屏
    await this.waitForUserMessage(selector, userInput, ctx);

    // 阶段2：监听AI回复
    yield* this.monitorAIResponse(selector, completionId, ctx);

    logger.info('========== 流式监听结束 ==========');
  }

  async getLatestMessageSnapshot(selector) {
    try {
      const result = await this.page.evaluate(sel => {
        const elements = document.querySelectorAll(sel);
        const groups = [];

        for (const el of elements) {
          const text = el.innerText || el.textContent || '';
          if (text.trim()) {
            groups.push({
              text: text.trim(),
              length: text.length
            });
          }
        }

        return {
          groupsCount: groups.length,
          textLen: groups.length > 0 ? groups[groups.length - 1].length : 0,
          groups
        };
      }, selector);

      return result;
    } catch (error) {
      logger.error('获取消息快照失败:', error);
      return { groupsCount: 0, textLen: 0, groups: [] };
    }
  }

  async waitForUserMessage(selector, userInput, ctx) {
    const USER_MSG_WAIT = webConfigService.getBrowserConstant('STREAM_USER_MSG_WAIT') || 1.5;
    const PRE_BASELINE_DELAY = webConfigService.getBrowserConstant('STREAM_PRE_BASELINE_DELAY') || 0.3;
    const CHECK_INTERVAL = 0.3;

    logger.info('[WAIT_USER] 等待用户消息上屏...');
    await this.delay(PRE_BASELINE_DELAY);

    const startTime = Date.now();
    let lastTextLen = 0;
    let stableCount = 0;

    while (Date.now() - startTime < USER_MSG_WAIT * 1000) {
      if (this.shouldStop()) {
        logger.info('[WAIT_USER] 被取消');
        return;
      }

      const snapshot = await this.getLatestMessageSnapshot(selector);

      if (snapshot.textLen > lastTextLen) {
        lastTextLen = snapshot.textLen;
        stableCount = 0;
      } else {
        stableCount++;
      }

      if (stableCount >= 5) {
        ctx.userBaseline = snapshot;
        ctx.userMsgConfirmed = true;
        ctx.activeTurnBaselineLen = snapshot.textLen;
        logger.info(`[WAIT_USER] 用户消息已确认 (len=${snapshot.textLen})`);
        return;
      }

      await this.delay(CHECK_INTERVAL);
    }

    logger.warn('[WAIT_USER] 超时，使用当前快照');
    ctx.userBaseline = await this.getLatestMessageSnapshot(selector);
    ctx.activeTurnBaselineLen = ctx.userBaseline.textLen;
  }

  async *monitorAIResponse(selector, completionId, ctx) {
    const STREAM_CHECK_INTERVAL = webConfigService.getBrowserConstant('STREAM_CHECK_INTERVAL_DEFAULT') || 0.3;
    const STREAM_SILENCE_THRESHOLD = webConfigService.getBrowserConstant('STREAM_SILENCE_THRESHOLD') || 6.0;
    const STREAM_STABLE_COUNT_THRESHOLD = webConfigService.getBrowserConstant('STREAM_STABLE_COUNT_THRESHOLD') || 5;
    const STREAM_MAX_TIMEOUT = webConfigService.getBrowserConstant('STREAM_MAX_TIMEOUT') || 600;

    logger.info('[MONITOR] 开始监听AI回复...');

    const startTime = Date.now();
    let silenceStart = null;
    let lastText = '';

    while (Date.now() - startTime < STREAM_MAX_TIMEOUT * 1000) {
      if (this.shouldStop()) {
        logger.info('[MONITOR] 被取消');
        break;
      }

      const snapshot = await this.getLatestMessageSnapshot(selector);
      const currentText = snapshot.groups.map(g => g.text).join('\n');

      const { diff, shouldUseMax, reason } = ctx.calculateDiff(currentText);

      if (diff) {
        silenceStart = null;
        ctx.stableTextCount = 0;
        ctx.lastStableText = currentText;

        // 发送新内容
        yield this.formatter.packChunk(diff, completionId);
        ctx.updateAfterSend(diff, currentText);

        logger.debug(`[MONITOR] 发送 ${diff.length} 字符`);
      } else if (reason) {
        logger.debug(`[MONITOR] ${reason}`);
      } else {
        ctx.stableTextCount++;

        if (ctx.stableTextCount >= STREAM_STABLE_COUNT_THRESHOLD) {
          if (silenceStart === null) {
            silenceStart = Date.now();
          } else if (Date.now() - silenceStart > STREAM_SILENCE_THRESHOLD * 1000) {
            logger.info('[MONITOR] 检测到稳定状态，结束监听');
            break;
          }
        }
      }

      await this.delay(STREAM_CHECK_INTERVAL);
    }

    // 发送完成标记
    yield this.formatter.packFinish(completionId);
  }

  generateId() {
    return `chatcmpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  delay(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }
}