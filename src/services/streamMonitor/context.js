/**
 * 流式监听上下文模块
 */

import { webConfigService } from '../webConfig.js';

export class StreamContext {
  constructor() {
    this.maxSeenText = '';
    this.sentContentLength = 0;
    this.baselineSnapshot = null;
    this.activeTurnStarted = false;
    this.stableTextCount = 0;
    this.lastStableText = '';
    this.activeTurnBaselineLen = 0;
    this.instantBaseline = null;
    this.userBaseline = null;
    this.instantLastNodeLen = 0;
    this.contentEverChanged = false;
    this.userMsgConfirmed = false;
    this.outputTargetAnchor = null;
    this.outputTargetCount = 0;
    this.pendingNewAnchor = null;
    this.pendingNewAnchorSeen = 0;
  }

  resetForNewTarget() {
    this.maxSeenText = '';
    this.sentContentLength = 0;
    this.stableTextCount = 0;
    this.lastStableText = '';
    this.activeTurnBaselineLen = 0;
    this.contentEverChanged = false;
  }

  calculateDiff(currentText) {
    if (!currentText) {
      return { diff: '', shouldUseMax: false, reason: null };
    }

    const effectiveStart = this.activeTurnBaselineLen + this.sentContentLength;

    // 正常追加：直接切尾巴
    if (currentText.length > effectiveStart) {
      return {
        diff: currentText.slice(effectiveStart),
        shouldUseMax: false,
        reason: null
      };
    }

    // 内容缩短：容忍小幅抖动
    if (currentText.length >= this.activeTurnBaselineLen) {
      const currentActiveText = currentText.slice(this.activeTurnBaselineLen);
      if (currentActiveText.length < this.sentContentLength) {
        const shrinkAmount = this.sentContentLength - currentActiveText.length;
        const tolerance = webConfigService.getBrowserConstant('STREAM_CONTENT_SHRINK_TOLERANCE') || 3;

        if (shrinkAmount <= tolerance) {
          return { diff: '', shouldUseMax: false, reason: null };
        }

        return {
          diff: '',
          shouldUseMax: false,
          reason: `内容缩短 ${shrinkAmount} 字符`
        };
      }
    }

    // 兜底：使用历史最大快照补齐
    if (this.maxSeenText && this.maxSeenText.length > effectiveStart) {
      return {
        diff: this.maxSeenText.slice(effectiveStart),
        shouldUseMax: true,
        reason: '使用历史快照'
      };
    }

    return { diff: '', shouldUseMax: false, reason: null };
  }

  updateAfterSend(diff, currentText) {
    this.sentContentLength += diff.length;
    this.lastStableText = currentText;
    this.stableTextCount = 0;

    if (currentText.length > this.maxSeenText.length) {
      this.maxSeenText = currentText;
    }
  }
}