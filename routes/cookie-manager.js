/**
 * Cookie 管理路由 - 统一的 Cookie 导入/导出接口
 */

import express from 'express';
import { cookieManager } from '../src/services/cookieManager.js';
import { logger } from '../src/utils/logger.js';
import { logOperation } from '../db_init.js';

const router = express.Router();

// ================= 获取所有 Cookies =================

/**
 * 获取所有域名的 Cookies
 * GET /api/cookies
 */
router.get('/api/cookies', async (req, res) => {
  try {
    const allCookies = await cookieManager.getAllCookies();
    const domains = await cookieManager.listDomains();

    res.json({
      success: true,
      domains,
      cookies: allCookies,
      total: domains.length
    });
  } catch (error) {
    logger.error('获取Cookies失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// ================= 获取指定域名的 Cookies =================

/**
 * 获取指定域名的 Cookies
 * GET /api/cookies/:domain
 */
router.get('/api/cookies/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    const cookies = await cookieManager.loadCookies(domain);

    if (!cookies) {
      return res.status(404).json({
        success: false,
        error: `未找到域名 ${domain} 的 Cookies`
      });
    }

    res.json({
      success: true,
      domain,
      cookies,
      count: cookies.length
    });
  } catch (error) {
    logger.error('获取域名Cookies失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// ================= 保存 Cookies =================

/**
 * 保存指定域名的 Cookies
 * POST /api/cookies/:domain
 */
router.post('/api/cookies/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    const { cookies } = req.body;

    if (!Array.isArray(cookies)) {
      return res.status(400).json({
        success: false,
        error: 'cookies 必须是数组'
      });
    }

    await cookieManager.saveCookies(domain, cookies);

    // 记录操作日志
    logOperation(
      global.db,
      'SAVE_COOKIES',
      'cookie',
      null,
      domain,
      `保存了 ${cookies.length} 个 Cookies`,
      'success',
      req
    );

    res.json({
      success: true,
      message: `已保存 ${cookies.length} 个 Cookies 到 ${domain}`,
      domain,
      count: cookies.length
    });
  } catch (error) {
    logger.error('保存Cookies失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// ================= 删除 Cookies =================

/**
 * 删除指定域名的 Cookies
 * DELETE /api/cookies/:domain
 */
router.delete('/api/cookies/:domain', async (req, res) => {
  try {
    const { domain } = req.params;

    await cookieManager.deleteCookies(domain);

    // 记录操作日志
    logOperation(
      global.db,
      'DELETE_COOKIES',
      'cookie',
      null,
      domain,
      `删除了 ${domain} 的 Cookies`,
      'success',
      req
    );

    res.json({
      success: true,
      message: `已删除 ${domain} 的 Cookies`,
      domain
    });
  } catch (error) {
    logger.error('删除Cookies失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// ================= 导出所有 Cookies =================

/**
 * 导出所有 Cookies (JSON 格式)
 * GET /api/cookies/export
 */
router.get('/api/cookies/export', async (req, res) => {
  try {
    const format = req.query.format || 'json'; // json, netcookies, jsonl

    const allCookies = await cookieManager.getAllCookies();
    const exportData = {
      exported_at: new Date().toISOString(),
      total_domains: Object.keys(allCookies).length,
      cookies: allCookies
    };

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="cookies-export.json"');
      res.send(JSON.stringify(exportData, null, 2));
    } else if (format === 'netcookies') {
      // 导出为 Netscape Cookie 格式
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', 'attachment; filename="cookies.txt"');

      let netcookies = '# Netscape HTTP Cookie File\n';
      netcookies += '# This is a generated file! Do not edit.\n\n';

      for (const [domain, cookies] of Object.entries(allCookies)) {
        for (const cookie of cookies) {
          const domainFlag = cookie.domain.startsWith('.') ? 'TRUE' : 'FALSE';
          const path = cookie.path || '/';
          const secure = cookie.secure ? 'TRUE' : 'FALSE';
          const expires = cookie.expires
            ? new Date(cookie.expires).getTime() / 1000
            : 0;
          const name = cookie.name || '';
          const value = cookie.value || '';

          netcookies += `${domain}\t${domainFlag}\t${path}\t${secure}\t${expires}\t${name}\t${value}\n`;
        }
      }

      res.send(netcookies);
    } else if (format === 'jsonl') {
      // JSON Lines 格式，每行一个 Cookie
      res.setHeader('Content-Type', 'application/jsonl');
      res.setHeader('Content-Disposition', 'attachment; filename="cookies-export.jsonl"');

      const lines = [];
      for (const [domain, cookies] of Object.entries(allCookies)) {
        for (const cookie of cookies) {
          lines.push(JSON.stringify({ domain, ...cookie }));
        }
      }

      res.send(lines.join('\n') + '\n');
    } else {
      res.status(400).json({
        success: false,
        error: `不支持的格式: ${format}. 支持的格式: json, netcookies, jsonl`
      });
    }

    // 记录操作日志
    logOperation(
      global.db,
      'EXPORT_COOKIES',
      'cookie',
      null,
      'all',
      `导出了 ${Object.keys(allCookies).length} 个域名的 Cookies`,
      'success',
      req
    );
  } catch (error) {
    logger.error('导出Cookies失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// ================= 导出指定域名的 Cookies =================

/**
 * 导出指定域名的 Cookies
 * GET /api/cookies/export/:domain
 */
router.get('/api/cookies/export/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    const format = req.query.format || 'json';

    const cookies = await cookieManager.loadCookies(domain);

    if (!cookies || cookies.length === 0) {
      return res.status(404).json({
        success: false,
        error: `未找到域名 ${domain} 的 Cookies`
      });
    }

    const exportData = {
      exported_at: new Date().toISOString(),
      domain,
      total_cookies: cookies.length,
      cookies
    };

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${domain}-cookies.json"`);
      res.send(JSON.stringify(exportData, null, 2));
    } else if (format === 'netcookies') {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${domain}-cookies.txt"`);

      let netcookies = `# Netscape HTTP Cookie File for ${domain}\n\n`;

      for (const cookie of cookies) {
        const domainFlag = cookie.domain.startsWith('.') ? 'TRUE' : 'FALSE';
        const path = cookie.path || '/';
        const secure = cookie.secure ? 'TRUE' : 'FALSE';
        const expires = cookie.expires
          ? new Date(cookie.expires).getTime() / 1000
          : 0;
        const name = cookie.name || '';
        const value = cookie.value || '';

        netcookies += `${cookie.domain}\t${domainFlag}\t${path}\t${secure}\t${expires}\t${name}\t${value}\n`;
      }

      res.send(netcookies);
    } else {
      res.status(400).json({
        success: false,
        error: `不支持的格式: ${format}. 支持的格式: json, netcookies`
      });
    }

    // 记录操作日志
    logOperation(
      global.db,
      'EXPORT_COOKIES',
      'cookie',
      null,
      domain,
      `导出了 ${cookies.length} 个 Cookies`,
      'success',
      req
    );
  } catch (error) {
    logger.error('导出域名Cookies失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// ================= 导入 Cookies =================

/**
 * 导入 Cookies
 * POST /api/cookies/import
 */
router.post('/api/cookies/import', async (req, res) => {
  try {
    const { format, cookies, domain } = req.body;

    if (format === 'json') {
      // JSON 格式导入
      if (!cookies) {
        return res.status(400).json({
          success: false,
          error: '缺少 cookies 数据'
        });
      }

      if (Array.isArray(cookies)) {
        // 多域名格式: { cookies: [{ domain: '...', ... }] }
        const domains = new Set();
        for (const cookieData of cookies) {
          const cookieDomain = cookieData.domain || domain;
          if (!cookieDomain) {
            continue;
          }

          const cookieArray = Array.isArray(cookieData.cookies) ? cookieData.cookies : [cookieData];
          await cookieManager.saveCookies(cookieDomain, cookieArray);
          domains.add(cookieDomain);
        }

        res.json({
          success: true,
          message: `已导入 ${domains.size} 个域名的 Cookies`,
          imported_domains: Array.from(domains)
        });
      } else if (typeof cookies === 'object') {
        // 单域名格式: { cookies: [cookie1, cookie2] } 或 { domain: 'cookies': [cookies] }
        const targetDomain = domain || Object.keys(cookies)[0];
        if (!targetDomain) {
          return res.status(400).json({
            success: false,
            error: '无法确定目标域名'
          });
        }

        const cookieArray = cookies[targetDomain] || [];
        if (!Array.isArray(cookieArray) && !Array.isArray(cookies)) {
          return res.status(400).json({
            success: false,
            error: 'cookies 数据格式不正确'
          });
        }

        const cookieList = Array.isArray(cookieArray) ? cookieArray : Object.values(cookies).flat();
        await cookieManager.saveCookies(targetDomain, cookieList);

        res.json({
          success: true,
          message: `已导入 ${cookieList.length} 个 Cookies 到 ${targetDomain}`,
          domain: targetDomain,
          count: cookieList.length
        });
      }
    } else if (format === 'netcookies') {
      // Netscape Cookie 格式导入
      const { lines } = req.body;
      if (!Array.isArray(lines)) {
        return res.status(400).json({
          success: false,
          error: 'lines 必须是数组'
        });
      }

      const cookiesMap = new Map();

      for (const line of lines) {
        if (line.trim().startsWith('#') || !line.trim()) {
          continue;
        }

        const parts = line.split('\t');
        if (parts.length < 7) {
          continue;
        }

        const cookie = {
          domain: parts[0],
          path: parts[2],
          secure: parts[3] === 'TRUE',
          expires: new Date(parseFloat(parts[4]) * 1000).toISOString(),
          name: parts[5],
          value: parts[6],
          httpOnly: false
        };

        const domain = cookie.domain;
        if (!cookiesMap.has(domain)) {
          cookiesMap.set(domain, []);
        }
        cookiesMap.get(domain).push(cookie);
      }

      for (const [domain, cookieList] of cookiesMap.entries()) {
        await cookieManager.saveCookies(domain, cookieList);
      }

      res.json({
        success: true,
        message: `已导入 ${cookiesMap.size} 个域名的 Cookies`,
        imported_domains: Array.from(cookiesMap.keys())
      });
    } else {
      res.status(400).json({
        success: false,
        error: `不支持的格式: ${format}. 支持的格式: json, netcookies`
      });
    }

    // 记录操作日志
    logOperation(
      global.db,
      'IMPORT_COOKIES',
      'cookie',
      null,
      domain || 'multiple',
      '导入 Cookies',
      'success',
      req
    );
  } catch (error) {
    logger.error('导入Cookies失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// ================= 列出所有域名 =================

/**
 * 列出所有有 Cookies 的域名
 * GET /api/cookies/domains
 */
router.get('/api/cookies/domains', async (req, res) => {
  try {
    const domains = await cookieManager.listDomains();

    res.json({
      success: true,
      domains,
      total: domains.length
    });
  } catch (error) {
    logger.error('列出域名失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// ================= 迁移到加密存储 =================

/**
 * 将所有明文 Cookies 迁移到加密存储
 * POST /api/cookies/migrate
 */
router.post('/api/cookies/migrate', async (req, res) => {
  try {
    const result = await cookieManager.migrateToEncryption();

    res.json({
      success: true,
      message: `迁移完成: 成功 ${result.migrated}, 失败 ${result.failed}`,
      ...result
    });

    // 记录操作日志
    logOperation(
      global.db,
      'MIGRATE_COOKIES',
      'cookie',
      null,
      'all',
      `Cookies 加密迁移: 成功 ${result.migrated}, 失败 ${result.failed}`,
      result.failed === 0 ? 'success' : 'warning',
      req
    );
  } catch (error) {
    logger.error('迁移Cookies失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// ================= 加密/解密 Cookie 数据 =================

/**
 * 重新加密所有 Cookies (更换密钥后使用)
 * POST /api/cookies/reencrypt
 */
router.post('/api/cookies/reencrypt', async (req, res) => {
  try {
    const domains = await cookieManager.listDomains();
    let success = 0;
    let failed = 0;

    for (const domain of domains) {
      try {
        const cookies = await cookieManager.loadCookies(domain);
        if (cookies) {
          await cookieManager.saveCookies(domain, cookies);
          success++;
        }
      } catch {
        failed++;
      }
    }

    res.json({
      success: true,
      message: `重新加密完成: 成功 ${success}, 失败 ${failed}`,
      success,
      failed,
      total: domains.length
    });

    // 记录操作日志
    logOperation(
      global.db,
      'REENCRYPT_COOKIES',
      'cookie',
      null,
      'all',
      `Cookies 重新加密: 成功 ${success}, 失败 ${failed}`,
      failed === 0 ? 'success' : 'warning',
      req
    );
  } catch (error) {
    logger.error('重新加密Cookies失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
