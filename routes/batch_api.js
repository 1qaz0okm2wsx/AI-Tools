/**
 * 批量操作API路由
 */

import express from 'express';
import { getDatabase, run, query } from '../src/utils/dbHelper.js';
import { logger } from '../src/utils/logger.js';

const router = express.Router();

/**
 * 批量删除提供商
 * POST /api/batch/providers/delete
 */
router.post('/api/batch/providers/delete', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: '无效的提供商ID列表'
      });
    }

    const db = getDatabase(req);
    if (!db) {
      return res.status(500).json({
        success: false,
        error: '数据库连接不可用'
      });
    }

    let deletedCount = 0;
    const errors = [];

    for (const id of ids) {
      try {
        await run(db, 'DELETE FROM models WHERE provider_id = ?', [id]);
        await run(db, 'DELETE FROM providers WHERE id = ?', [id]);
        deletedCount++;
      } catch (error) {
        errors.push({ id, error: error.message });
      }
    }

    logger.info(`[BATCH] 批量删除提供商: ${deletedCount} 成功, ${errors.length} 失败`);

    res.json({
      success: true,
      deletedCount,
      errorCount: errors.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    logger.error('批量删除提供商失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 批量启用/禁用API密钥
 * POST /api/batch/api-keys/toggle
 */
router.post('/api/batch/api-keys/toggle', async (req, res) => {
  try {
    const { ids, enabled } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: '无效的API密钥ID列表'
      });
    }

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'enabled 必须是布尔值'
      });
    }

    const db = getDatabase(req);
    if (!db) {
      return res.status(500).json({
        success: false,
        error: '数据库连接不可用'
      });
    }

    let updatedCount = 0;
    const errors = [];

    for (const id of ids) {
      try {
        await run(db, 'UPDATE api_keys SET is_active = ? WHERE id = ?', [enabled ? 1 : 0, id]);
        updatedCount++;
      } catch (error) {
        errors.push({ id, error: error.message });
      }
    }

    logger.info(`[BATCH] 批量${enabled ? '启用' : '禁用'}API密钥: ${updatedCount} 成功, ${errors.length} 失败`);

    res.json({
      success: true,
      updatedCount,
      errorCount: errors.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    logger.error('批量切换API密钥失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 批量导入提供商
 * POST /api/batch/providers/import
 */
router.post('/api/batch/providers/import', async (req, res) => {
  try {
    const { providers } = req.body;

    if (!Array.isArray(providers) || providers.length === 0) {
      return res.status(400).json({
        success: false,
        error: '无效的提供商列表'
      });
    }

    const db = getDatabase(req);
    if (!db) {
      return res.status(500).json({
        success: false,
        error: '数据库连接不可用'
      });
    }

    let importedCount = 0;
    const errors = [];

    for (const provider of providers) {
      try {
        if (!provider.name || !provider.url || !provider.api_key) {
          errors.push({ provider, error: '缺少必填字段' });
          continue;
        }

        const result = await run(db, 
          'INSERT INTO providers (name, url, api_key, created_at) VALUES (?, ?, ?, ?)',
          [provider.name, provider.url, provider.api_key, new Date().toISOString()]
        );

        importedCount++;
      } catch (error) {
        errors.push({ provider, error: error.message });
      }
    }

    logger.info(`[BATCH] 批量导入提供商: ${importedCount} 成功, ${errors.length} 失败`);

    res.json({
      success: true,
      importedCount,
      errorCount: errors.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    logger.error('批量导入提供商失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 批量导出提供商
 * GET /api/batch/providers/export
 */
router.get('/api/batch/providers/export', async (req, res) => {
  try {
    const db = getDatabase(req);
    if (!db) {
      return res.status(500).json({
        success: false,
        error: '数据库连接不可用'
      });
    }

    const providers = await query(db, 'SELECT * FROM providers ORDER BY created_at DESC');

    const exportData = providers.map(p => ({
      id: p.id,
      name: p.name,
      url: p.url,
      api_key: p.api_key,
      created_at: p.created_at
    }));

    res.json({
      success: true,
      count: exportData.length,
      data: exportData
    });
  } catch (error) {
    logger.error('批量导出提供商失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;