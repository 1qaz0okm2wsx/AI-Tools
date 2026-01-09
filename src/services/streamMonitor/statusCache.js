/**
 * 生成状态缓存模块
 */

export class GeneratingStatusCache {
  constructor(page) {
    this.page = page;
    this.lastCheckTime = 0;
    this.lastResult = false;
    this.checkInterval = 0.5;
    this.foundSelector = null;
  }

  async isGenerating() {
    const now = Date.now() / 1000;
    if (now - this.lastCheckTime < this.checkInterval) {
      return this.lastResult;
    }

    this.lastCheckTime = now;

    if (this.foundSelector) {
      try {
        const element = await this.page.$(this.foundSelector);
        if (element) {
          const isVisible = await element.isIntersectingViewport();
          if (isVisible) {
            this.lastResult = true;
            return true;
          }
        }
      } catch (error) {
        // 忽略错误
      }
      this.foundSelector = null;
    }

    const indicatorSelectors = [
      'button[aria-label*="Stop"]',
      'button[aria-label*="stop"]',
      '[data-state="streaming"]',
      '.stop-generating'
    ];

    for (const selector of indicatorSelectors) {
      try {
        const element = await this.page.$(selector);
        if (element) {
          const isVisible = await element.isIntersectingViewport();
          if (isVisible) {
            this.foundSelector = selector;
            this.lastResult = true;
            return true;
          }
        }
      } catch (error) {
        // 忽略错误
      }
    }

    this.lastResult = false;
    return false;
  }
}