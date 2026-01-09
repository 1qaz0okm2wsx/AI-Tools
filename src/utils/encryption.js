/**
 * 加密工具模块
 * 用于 Cookie 和敏感数据的加密/解密
 */

import crypto from 'crypto';
import { logger } from './logger.js';

class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32;
    this.ivLength = 16;
    this.saltLength = 64;
    this.tagLength = 16;
    
    // 从环境变量获取密钥
    this.secretKey = process.env.COOKIE_ENCRYPTION_KEY;
    
    if (!this.secretKey) {
      const errorMsg = '❌ 安全错误: 未设置 COOKIE_ENCRYPTION_KEY 环境变量！请参考 .env.example 文件配置加密密钥。';
      logger.error('[ENCRYPTION] ' + errorMsg);
      throw new Error(errorMsg + ' 运行以下命令生成密钥: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    }
    
    // 验证密钥格式（必须是64个十六进制字符）
    if (!/^[a-f0-9]{64}$/i.test(this.secretKey)) {
      const errorMsg = '❌ 安全错误: COOKIE_ENCRYPTION_KEY 格式无效！必须是64个十六进制字符（32字节）。';
      logger.error('[ENCRYPTION] ' + errorMsg);
      throw new Error(errorMsg + ' 运行以下命令生成有效密钥: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    }
  }

  /**
   * 派生加密密钥
   * @param {Buffer} salt - 盐值
   * @returns {Buffer}
   */
  deriveKey(salt) {
    return crypto.scryptSync(this.secretKey, salt, this.keyLength);
  }

  /**
   * 加密数据
   * @param {any} data - 要加密的数据
   * @returns {{ iv: string, data: string, tag: string, salt: string }}
   */
  encrypt(data) {
    try {
      // 生成随机盐值和IV
      const salt = crypto.randomBytes(this.saltLength);
      const iv = crypto.randomBytes(this.ivLength);
      
      // 派生密钥
      const key = this.deriveKey(salt);
      
      // 创建加密器
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);
      
      // 加密数据
      const jsonString = JSON.stringify(data);
      const encrypted = Buffer.concat([
        cipher.update(jsonString, 'utf8'),
        cipher.final()
      ]);
      
      // 获取认证标签
      const authTag = /** @type {import('crypto').CipherGCM} */ (cipher).getAuthTag();
      
      return {
        iv: iv.toString('hex'),
        data: encrypted.toString('hex'),
        tag: authTag.toString('hex'),
        salt: salt.toString('hex')
      };
    } catch (error) {
      logger.error(`[ENCRYPTION] 加密失败: ${/** @type {Error} */ (error).message}`);
      throw new Error('数据加密失败');
    }
  }

  /**
   * 解密数据
   * @param {{ iv: string, data: string, tag: string, salt: string }} encrypted - 加密的数据
   * @returns {any}
   */
  decrypt(encrypted) {
    try {
      // 验证必需字段
      if (!encrypted.iv || !encrypted.data || !encrypted.tag || !encrypted.salt) {
        throw new Error('加密数据格式不完整');
      }
      
      // 派生密钥
      const salt = Buffer.from(encrypted.salt, 'hex');
      const key = this.deriveKey(salt);
      
      // 创建解密器
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        key,
        Buffer.from(encrypted.iv, 'hex')
      );
      
      // 设置认证标签
      /** @type {import('crypto').DecipherGCM} */ (decipher).setAuthTag(Buffer.from(encrypted.tag, 'hex'));
      
      // 解密数据
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encrypted.data, 'hex')),
        decipher.final()
      ]);
      
      return JSON.parse(decrypted.toString('utf8'));
    } catch (error) {
      logger.error(`[ENCRYPTION] 解密失败: ${/** @type {Error} */ (error).message}`);
      throw new Error('数据解密失败');
    }
  }

  /**
   * 生成随机密钥（用于初始化环境变量）
   * @returns {string}
   */
  static generateKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * 验证数据完整性
   * @param {any} data
   * @returns {boolean}
   */
  isValid(data) {
    return data && 
           typeof data === 'object' && 
           data.iv && 
           data.data && 
           data.tag && 
           data.salt;
  }
}

// 导出单例
export const encryptionService = new EncryptionService();

// 导出生成密钥的工具函数
export { EncryptionService };