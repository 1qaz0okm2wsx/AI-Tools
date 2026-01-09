/**
 * 数据库管理路由
 */

import express from 'express';
import path from 'path';
import { DatabaseService } from '../src/services/database/index.js';
import { logger } from '../src/utils/logger.js';

const router = express.Router();

/**
 * 获取数据库统计
 */
router.get('/api/database/stats', async (req, res) => {
  try {
    const dbService = new DatabaseService(/** @type {any} */ (global.db));
    const stats = await dbService.getStats();

    res.json({
      success: true,
      stats: stats,
      timestamp: new Date().toISOString()
    });
  } catch (/** @type {any} */ error) {
    logger.error('获取数据库统计失败:', error);
    res.status(500).json({
      success: false,
      error: error?.message || String(error)
    });
  }
});

/**
 * 优化数据库
 */
router.post('/api/database/optimize', async (req, res) => {
  try {
    const dbService = new DatabaseService(/** @type {any} */ (global.db));
    await dbService.optimize();

    res.json({
      success: true,
      message: '数据库优化完成',
      timestamp: new Date().toISOString()
    });
  } catch (/** @type {any} */ error) {
    logger.error('数据库优化失败:', error);
    res.status(500).json({
      success: false,
      error: error?.message || String(error)
    });
  }
});

/**
 * 备份数据库
 */
router.post('/api/database/backup', async (req, res) => {
  try {
    const { path } = req.body;
    const backupPath = path || `./backups/backup_${new Date().toISOString().replace(/[:.]/g, '-')}.db`;

    const dbService = new DatabaseService(/** @type {any} */ (global.db));
    const result = await dbService.backup(backupPath);

    res.json({
      success: true,
      message: '数据库备份完成',
      backupPath: result,
      timestamp: new Date().toISOString()
    });
  } catch (/** @type {any} */ error) {
    logger.error('数据库备份失败:', error);
    res.status(500).json({
      success: false,
      error: error?.message || String(error)
    });
  }
});

/**
 * 运行迁移
 */
router.post('/api/database/migrate', async (req, res) => {
  try {
    const dbService = new DatabaseService(/** @type {any} */ (global.db));
    await dbService.initialize();

    res.json({
      success: true,
      message: '数据库迁移完成',
      timestamp: new Date().toISOString()
    });
  } catch (/** @type {any} */ error) {
    logger.error('数据库迁移失败:', error);
    res.status(500).json({
      success: false,
      error: error?.message || String(error)
    });
  }
});

export default router;
