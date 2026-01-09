/**
 * 多标签页管理器
 */

import { logger } from '../utils/logger.js';
import configService from '../config/index.js';

export class TabManager {
  constructor() {
    this.tabs = new Map();
    this.activeTabId = null;
    this.maxTabs = -1; // -1 表示无限制
    this.tabCounter = 0;
  }

  /**
   * 初始化标签页管理器
   */
  async init() {
    const browserConfig = configService.getBrowserConfig();
    this.maxTabs = browserConfig.max_tabs;
    logger.info(`[TABS] 标签页管理器已初始化，最大标签页数: ${this.maxTabs === -1 ? '无限制' : this.maxTabs}`);
  }

  /**
   * 创建新标签页
   * @param {import('puppeteer').Page} page - 页面对象
   * @param {string} url - 页面URL
   * @param {string} [title] - 页面标题
   * @returns {string} 标签页ID
   */
  async createTab(page, url, title = 'New Tab') {
    const mode = configService.getUsageMode();
    const browserConfig = configService.getBrowserConfig();

    // 检查是否达到最大标签页数限制
    if (browserConfig.max_tabs > 0 && this.tabs.size >= browserConfig.max_tabs) {
      logger.warn(`[TABS] 已达到最大标签页数限制: ${browserConfig.max_tabs}`);
      throw new Error(`已达到最大标签页数限制: ${browserConfig.max_tabs}`);
    }

    const tabId = `tab_${++this.tabCounter}`;
    const tab = {
      id: tabId,
      page,
      url,
      title,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      isActive: false,
      sessionId: this.generateSessionId()
    };

    this.tabs.set(tabId, tab);
    logger.info(`[TABS] 创建标签页: ${tabId} (${url})`);

    return tabId;
  }

  /**
   * 获取标签页
   * @param {string} tabId - 标签页ID
   * @returns {Object | undefined} 标签页对象
   */
  getTab(tabId) {
    return this.tabs.get(tabId);
  }

  /**
   * 获取所有标签页
   * @returns {Array} 标签页列表
   */
  getAllTabs() {
    return Array.from(this.tabs.values()).sort((a, b) => b.lastAccessed - a.lastAccessed);
  }

  /**
   * 激活标签页
   * @param {string} tabId - 标签页ID
   */
  async activateTab(tabId) {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      logger.warn(`[TABS] 标签页不存在: ${tabId}`);
      return;
    }

    // 取消之前的活跃标签页
    if (this.activeTabId && this.activeTabId !== tabId) {
      const prevTab = this.tabs.get(this.activeTabId);
      if (prevTab) {
        prevTab.isActive = false;
        try {
          await prevTab.page.evaluate(() => {
            document.title = document.title.replace(' (Inactive)', '');
          });
        } catch (error) {
          logger.debug(`[TABS] 更新标签页标题失败: ${error.message}`);
        }
      }
    }

    // 激活新标签页
    tab.isActive = true;
    tab.lastAccessed = Date.now();
    this.activeTabId = tabId;

    try {
      await tab.page.bringToFront();
      await tab.page.evaluate(() => {
        document.title = document.title + ' (Active)';
      });
    } catch (error) {
      logger.debug(`[TABS] 激活标签页失败: ${error.message}`);
    }

    logger.info(`[TABS] 激活标签页: ${tabId}`);
  }

  /**
   * 关闭标签页
   * @param {string} tabId - 标签页ID
   */
  async closeTab(tabId) {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      logger.warn(`[TABS] 标签页不存在: ${tabId}`);
      return;
    }

    try {
      await tab.page.close();
      logger.info(`[TABS] 关闭标签页: ${tabId}`);
    } catch (error) {
      logger.error(`[TABS] 关闭标签页失败: ${error.message}`);
    }

    this.tabs.delete(tabId);

    // 如果关闭的是活跃标签页，选择下一个
    if (this.activeTabId === tabId) {
      const remainingTabs = this.getAllTabs();
      if (remainingTabs.length > 0) {
        await this.activateTab(remainingTabs[0].id);
      } else {
        this.activeTabId = null;
      }
    }
  }

  /**
   * 关闭所有标签页
   */
  async closeAllTabs() {
    const tabIds = Array.from(this.tabs.keys());
    for (const tabId of tabIds) {
      await this.closeTab(tabId);
    }
    logger.info(`[TABS] 已关闭所有标签页`);
  }

  /**
   * 更新标签页信息
   * @param {string} tabId - 标签页ID
   * @param {Object} updates - 更新内容
   */
  updateTab(tabId, updates) {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      logger.warn(`[TABS] 标签页不存在: ${tabId}`);
      return;
    }

    Object.assign(tab, updates);
    tab.lastAccessed = Date.now();
  }

  /**
   * 获取活跃标签页
   * @returns {Object | undefined} 活跃标签页
   */
  getActiveTab() {
    return this.activeTabId ? this.tabs.get(this.activeTabId) : undefined;
  }

  /**
   * 获取标签页统计
   * @returns {Object} 统计信息
   */
  getStats() {
    const mode = configService.getUsageMode();
    const browserConfig = configService.getBrowserConfig();

    return {
      total: this.tabs.size,
      max: browserConfig.max_tabs,
      active: this.activeTabId ? 1 : 0,
      mode,
      canCreate: browserConfig.max_tabs < 0 || this.tabs.size < browserConfig.max_tabs
    };
  }

  /**
   * 清理不活跃的标签页
   * @param {number} [inactiveTime] - 不活跃时间（毫秒），默认30分钟
   */
  async cleanupInactiveTabs(inactiveTime = 30 * 60 * 1000) {
    const now = Date.now();
    const inactiveTabs = [];

    for (const [tabId, tab] of this.tabs) {
      if (now - tab.lastAccessed > inactiveTime && !tab.isActive) {
        inactiveTabs.push(tabId);
      }
    }

    for (const tabId of inactiveTabs) {
      await this.closeTab(tabId);
    }

    if (inactiveTabs.length > 0) {
      logger.info(`[TABS] 清理了 ${inactiveTabs.length} 个不活跃的标签页`);
    }
  }

  /**
   * 生成会话ID
   * @returns {string} 会话ID
   */
  generateSessionId() {
    const mode = configService.getUsageMode();
    const browserConfig = configService.getBrowserConfig();

    if (browserConfig.session_isolation) {
      return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    } else {
      return 'global_session';
    }
  }

  /**
   * 按会话ID获取标签页
   * @param {string} sessionId - 会话ID
   * @returns {Array} 标签页列表
   */
  getTabsBySession(sessionId) {
    return Array.from(this.tabs.values()).filter(tab => tab.sessionId === sessionId);
  }

  /**
   * 关闭会话的所有标签页
   * @param {string} sessionId - 会话ID
   */
  async closeSession(sessionId) {
    const tabs = this.getTabsBySession(sessionId);
    for (const tab of tabs) {
      await this.closeTab(tab.id);
    }
    logger.info(`[TABS] 关闭会话的所有标签页: ${sessionId}`);
  }
}

export default new TabManager();