/**
 * Cookie管理模块 - 支持加密存储
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';
import { encryptionService } from '../utils/encryption.js';

class CookieManager {
  constructor() {
    this.cookiesDir = path.join(process.cwd(), 'cookies');
    this.useEncryption = process.env.ENABLE_COOKIE_ENCRYPTION !== 'false'; // 默认启用
  }

  async init() {
    try {
      // 创建cookies目录
      await fs.mkdir(this.cookiesDir, { recursive: true });
      logger.info(`[COOKIE] Cookies目录已创建: ${this.cookiesDir}`);
      
      if (this.useEncryption) {
        logger.info('[COOKIE] 🔒 Cookie加密已启用');
      } else {
        logger.warn('[COOKIE] ⚠️ Cookie加密已禁用（不推荐用于生产环境）');
      }
    } catch (error) {
      if (/** @type {any} */ (error).code !== 'EEXIST') {
        logger.error(`[COOKIE] 创建cookies目录失败: ${/** @type {Error} */ (error).message}`);
      }
    }
  }

  /**
   * 保存cookies
   * @param {string} domain - 域名
   * @param {any[]} cookies - Cookie数组
   */
  async saveCookies(domain, cookies) {
    try {
      // 过滤过期cookies
      const validCookies = cookies.filter(cookie => this.checkExpiry(cookie));
      
      if (validCookies.length === 0) {
        logger.debug(`[COOKIE] 没有有效的cookies需要保存: ${domain}`);
        return;
      }
      
      // 确定文件名和扩展名
      const ext = this.useEncryption ? '.enc' : '.json';
      const fileName = `${domain}${ext}`;
      const filePath = path.join(this.cookiesDir, fileName);
      
      let data;
      if (this.useEncryption) {
        // 加密保存
        const encrypted = encryptionService.encrypt(validCookies);
        data = JSON.stringify(encrypted, null, 2);
      } else {
        // 明文保存
        data = JSON.stringify(validCookies, null, 2);
      }
      
      await fs.writeFile(filePath, data, 'utf-8');
      
      logger.info(`[COOKIE] 💾 已保存 ${validCookies.length} 个cookies到: ${fileName}${this.useEncryption ? ' (加密)' : ''}`);
    } catch (error) {
      logger.error(`[COOKIE] 保存cookies失败: ${/** @type {Error} */ (error).message}`);
      throw error;
    }
  }

  /**
   * 加载cookies
   * @param {string} domain - 域名
   * @returns {Promise<any[] | null>}
   */
  async loadCookies(domain) {
    try {
      // 尝试加载加密文件
      const encFilePath = path.join(this.cookiesDir, `${domain}.enc`);
      const jsonFilePath = path.join(this.cookiesDir, `${domain}.json`);
      
      let filePath;
      let isEncrypted = false;
      
      // 优先尝试加密文件
      try {
        await fs.access(encFilePath);
        filePath = encFilePath;
        isEncrypted = true;
      } catch {
        // 如果加密文件不存在，尝试明文文件
        try {
          await fs.access(jsonFilePath);
          filePath = jsonFilePath;
          isEncrypted = false;
        } catch {
          logger.debug(`[COOKIE] 未找到cookies文件: ${domain}`);
          return null;
        }
      }
      
      // 读取文件
      const data = await fs.readFile(filePath, 'utf-8');
      let cookies;
      
      if (isEncrypted) {
        // 解密
        const encrypted = JSON.parse(data);
        cookies = encryptionService.decrypt(encrypted);
        logger.info(`[COOKIE] 📥 已加载 ${cookies.length} 个cookies从: ${path.basename(filePath)} (已解密)`);
      } else {
        // 明文
        cookies = JSON.parse(data);
        logger.info(`[COOKIE] 📥 已加载 ${cookies.length} 个cookies从: ${path.basename(filePath)}`);
        
        // 如果启用了加密但加载的是明文文件，自动迁移
        if (this.useEncryption) {
          logger.info(`[COOKIE] 🔄 自动迁移到加密存储: ${domain}`);
          await this.saveCookies(domain, cookies);
          // 删除明文文件
          await fs.unlink(jsonFilePath).catch(() => {});
        }
      }
      
      // 过滤过期cookies
      const validCookies = cookies.filter((/** @type {any} */ cookie) => this.checkExpiry(cookie));
      
      if (validCookies.length < cookies.length) {
        logger.debug(`[COOKIE] 已过滤 ${cookies.length - validCookies.length} 个过期cookies`);
        // 更新文件（删除过期cookies）
        if (validCookies.length > 0) {
          await this.saveCookies(domain, validCookies);
        } else {
          await this.deleteCookies(domain);
        }
      }
      
      return validCookies.length > 0 ? validCookies : null;
    } catch (error) {
      logger.error(`[COOKIE] 加载cookies失败: ${/** @type {Error} */ (error).message}`);
      return null;
    }
  }

  /**
   * 检查cookie是否过期
   * @param {any} cookie
   * @returns {boolean}
   */
  checkExpiry(cookie) {
    if (!cookie.expires) {
      // Session cookie，没有过期时间
      return true;
    }
    
    try {
      const expiryTime = new Date(cookie.expires).getTime();
      const now = Date.now();
      return now < expiryTime;
    } catch {
      // 如果无法解析过期时间，保留cookie
      return true;
    }
  }

  /**
   * 删除cookies
   * @param {string} domain - 域名
   */
  async deleteCookies(domain) {
    try {
      // 删除两种可能的文件
      const encFilePath = path.join(this.cookiesDir, `${domain}.enc`);
      const jsonFilePath = path.join(this.cookiesDir, `${domain}.json`);
      
      let deleted = false;
      
      try {
        await fs.unlink(encFilePath);
        deleted = true;
      } catch (error) {
        if (/** @type {any} */ (error).code !== 'ENOENT') {
          throw error;
        }
      }
      
      try {
        await fs.unlink(jsonFilePath);
        deleted = true;
      } catch (error) {
        if (/** @type {any} */ (error).code !== 'ENOENT') {
          throw error;
        }
      }
      
      if (deleted) {
        logger.info(`[COOKIE] 🗑️ 已删除cookies: ${domain}`);
      }
    } catch (error) {
      logger.error(`[COOKIE] 删除cookies失败: ${/** @type {Error} */ (error).message}`);
      throw error;
    }
  }

  /**
   * 列出所有域名
   * @returns {Promise<string[]>}
   */
  async listDomains() {
    try {
      const files = await fs.readdir(this.cookiesDir);
      const domains = files
        .filter(file => file.endsWith('.json') || file.endsWith('.enc'))
        .map(file => file.replace(/\.(json|enc)$/, ''))
        // 去重（同一域名可能同时存在.json和.enc文件）
        .filter((domain, index, self) => self.indexOf(domain) === index);

      return domains;
    } catch (error) {
      logger.error(`[COOKIE] 列出域名失败: ${/** @type {Error} */ (error).message}`);
      return [];
    }
  }

  /**
   * 获取所有cookies
   * @returns {Promise<Record<string, any>>}
   */
  async getAllCookies() {
    const domains = await this.listDomains();
    /** @type {Record<string, any>} */
    const result = {};

    for (const domain of domains) {
      const cookies = await this.loadCookies(domain);
      if (cookies) {
        result[domain] = cookies;
      }
    }

    return result;
  }

  /**
   * 迁移所有明文cookies到加密格式
   * @returns {Promise<{migrated: number, failed: number, errors: string[]}>}
   */
  async migrateToEncryption() {
    logger.info('[COOKIE] 🔄 开始迁移cookies到加密格式...');
    
    let migrated = 0;
    let failed = 0;
    /** @type {string[]} */
    const errors = [];
    
    try {
      const files = await fs.readdir(this.cookiesDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));
      
      logger.info(`[COOKIE] 找到 ${jsonFiles.length} 个明文cookie文件`);
      
      for (const file of jsonFiles) {
        const domain = file.replace('.json', '');
        
        try {
          const filePath = path.join(this.cookiesDir, file);
          const data = await fs.readFile(filePath, 'utf-8');
          const cookies = JSON.parse(data);
          
          // 启用加密并保存
          const wasEncrypted = this.useEncryption;
          this.useEncryption = true;
          
          await this.saveCookies(domain, cookies);
          
          // 删除原文件
          await fs.unlink(filePath);
          
          migrated++;
          logger.info(`[COOKIE] ✅ 已迁移: ${domain}`);
          
          this.useEncryption = wasEncrypted;
        } catch (error) {
          failed++;
          const errorMsg = `${domain}: ${/** @type {Error} */ (error).message}`;
          errors.push(errorMsg);
          logger.error(`[COOKIE] ❌ 迁移失败: ${errorMsg}`);
        }
      }
      
      logger.info(`[COOKIE] 迁移完成: 成功 ${migrated}, 失败 ${failed}`);
    } catch (error) {
      logger.error(`[COOKIE] 迁移过程出错: ${/** @type {Error} */ (error).message}`);
    }
    
    return { migrated, failed, errors };
  }
}

// 导出单例
export const cookieManager = new CookieManager();