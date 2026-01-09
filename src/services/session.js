/**
 * 会话管理器
 */

import { logger } from '../utils/logger.js';
import configService from '../config/index.js';

export class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.sessionCounter = 0;
    this.sessionTimeout = 30 * 60 * 1000; // 30分钟
    this.cleanupInterval = null;
  }

  /**
   * 初始化会话管理器
   */
  async init() {
    const mode = configService.getUsageMode();
    const browserConfig = configService.getBrowserConfig();

    if (!browserConfig.session_isolation) {
      logger.info('[SESSION] 会话隔离已禁用，使用全局会话');
      return;
    }

    logger.info('[SESSION] 会话管理器已初始化');

    // 启动定期清理
    this.startCleanup();
  }

  /**
   * 创建新会话
   * @param {Object} [metadata] - 会话元数据
   * @returns {string} 会话ID
   */
  createSession(metadata = {}) {
    const mode = configService.getUsageMode();
    const browserConfig = configService.getBrowserConfig();

    if (!browserConfig.session_isolation) {
      return 'global_session';
    }

    const sessionId = `session_${++this.sessionCounter}_${Date.now()}`;
    const session = {
      id: sessionId,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      metadata,
      data: {},
      isActive: true
    };

    this.sessions.set(sessionId, session);
    logger.info(`[SESSION] 创建会话: ${sessionId}`);

    return sessionId;
  }

  /**
   * 获取会话
   * @param {string} sessionId - 会话ID
   * @returns {Object | undefined} 会话对象
   */
  getSession(sessionId) {
    const mode = configService.getUsageMode();
    const browserConfig = configService.getBrowserConfig();

    if (!browserConfig.session_isolation && sessionId === 'global_session') {
      return {
        id: 'global_session',
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        metadata: {},
        data: {},
        isActive: true
      };
    }

    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastAccessed = Date.now();
      return session;
    }

    return undefined;
  }

  /**
   * 更新会话数据
   * @param {string} sessionId - 会话ID
   * @param {Object} data - 会话数据
   */
  updateSession(sessionId, data) {
    const mode = configService.getUsageMode();
    const browserConfig = configService.getBrowserConfig();

    if (!browserConfig.session_isolation) {
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`[SESSION] 会话不存在: ${sessionId}`);
      return;
    }

    session.data = { ...session.data, ...data };
    session.lastAccessed = Date.now();
    logger.debug(`[SESSION] 更新会话数据: ${sessionId}`);
  }

  /**
   * 删除会话
   * @param {string} sessionId - 会话ID
   */
  deleteSession(sessionId) {
    const mode = configService.getUsageMode();
    const browserConfig = configService.getBrowserConfig();

    if (!browserConfig.session_isolation && sessionId === 'global_session') {
      return;
    }

    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.delete(sessionId);
      logger.info(`[SESSION] 删除会话: ${sessionId}`);
    } else {
      logger.warn(`[SESSION] 会话不存在: ${sessionId}`);
    }
  }

  /**
   * 获取所有会话
   * @returns {Array} 会话列表
   */
  getAllSessions() {
    const mode = configService.getUsageMode();
    const browserConfig = configService.getBrowserConfig();

    if (!browserConfig.session_isolation) {
      return [{
        id: 'global_session',
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        metadata: {},
        data: {},
        isActive: true
      }];
    }

    return Array.from(this.sessions.values())
      .sort((a, b) => b.lastAccessed - a.lastAccessed);
  }

  /**
   * 清理过期会话
   * @param {number} [timeout] - 超时时间（毫秒）
   */
  cleanupExpiredSessions(timeout = this.sessionTimeout) {
    const now = Date.now();
    const expiredSessions = [];

    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastAccessed > timeout) {
        expiredSessions.push(sessionId);
      }
    }

    for (const sessionId of expiredSessions) {
      this.deleteSession(sessionId);
    }

    if (expiredSessions.length > 0) {
      logger.info(`[SESSION] 清理了 ${expiredSessions.length} 个过期会话`);
    }
  }

  /**
   * 启动定期清理
   */
  startCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000); // 每5分钟清理一次

    logger.info('[SESSION] 定期清理已启动');
  }

  /**
   * 停止定期清理
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('[SESSION] 定期清理已停止');
    }
  }

  /**
   * 获取会话统计
   * @returns {Object} 统计信息
   */
  getStats() {
    const mode = configService.getUsageMode();
    const browserConfig = configService.getBrowserConfig();

    return {
      total: browserConfig.session_isolation ? this.sessions.size : 1,
      active: browserConfig.session_isolation ? 
        Array.from(this.sessions.values()).filter(s => s.isActive).length : 1,
      mode,
      isolationEnabled: browserConfig.session_isolation,
      timeout: this.sessionTimeout
    };
  }

  /**
   * 激活会话
   * @param {string} sessionId - 会话ID
   */
  activateSession(sessionId) {
    const mode = configService.getUsageMode();
    const browserConfig = configService.getBrowserConfig();

    if (!browserConfig.session_isolation) {
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`[SESSION] 会话不存在: ${sessionId}`);
      return;
    }

    session.isActive = true;
    session.lastAccessed = Date.now();
    logger.info(`[SESSION] 激活会话: ${sessionId}`);
  }

  /**
   * 停用会话
   * @param {string} sessionId - 会话ID
   */
  deactivateSession(sessionId) {
    const mode = configService.getUsageMode();
    const browserConfig = configService.getBrowserConfig();

    if (!browserConfig.session_isolation) {
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`[SESSION] 会话不存在: ${sessionId}`);
      return;
    }

    session.isActive = false;
    session.lastAccessed = Date.now();
    logger.info(`[SESSION] 停用会话: ${sessionId}`);
  }

  /**
   * 清空所有会话
   */
  clearAllSessions() {
    const count = this.sessions.size;
    this.sessions.clear();
    logger.info(`[SESSION] 已清空所有会话 (${count} 个)`);
  }
}

export default new SessionManager();