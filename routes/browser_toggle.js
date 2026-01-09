import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../src/utils/logger.js';

const router = express.Router();
const ENABLED_FILE = path.join(process.cwd(), 'config', 'browser-enabled.json');
const PERF_FILE = path.join(process.cwd(), 'config', 'browser-performance-max.json');

router.get('/api/browser/status', async (req, res) => {
  try {
    const data = await fs.readFile(ENABLED_FILE, 'utf-8');
    const config = JSON.parse(data);
    res.json(config);
  } catch (error) {
    logger.error('[BROWSER-TOGGLE] 读取状态失败:', error);
    res.json({ enabled: false, error: error.message });
  }
});

router.post('/api/browser/toggle', async (req, res) => {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'enabled必须是布尔值' });
    }

    const data = await fs.readFile(ENABLED_FILE, 'utf-8');
    const config = JSON.parse(data);

    config.enabled = enabled;
    config.last_toggle_time = new Date().toISOString();

    await fs.writeFile(ENABLED_FILE, JSON.stringify(config, null, 2), 'utf-8');

    logger.info(`[BROWSER-TOGGLE] 功能已${enabled ? '启用' : '禁用'}`);

    res.json({
      success: true,
      enabled,
      message: `浏览器功能已${enabled ? '启用' : '禁用'}`
    });
  } catch (error) {
    logger.error('[BROWSER-TOGGLE] 切换失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/browser/config', async (req, res) => {
  try {
    const enabledData = await fs.readFile(ENABLED_FILE, 'utf-8');
    const perfData = await fs.readFile(PERF_FILE, 'utf-8');

    res.json({
      enabled: JSON.parse(enabledData).enabled,
      performance: JSON.parse(perfData)
    });
  } catch (error) {
    logger.error('[BROWSER-TOGGLE] 获取配置失败:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
