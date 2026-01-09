/**
 * 配置管理API路由
 */

import express from 'express';
import configService from '../src/services/config/index.js';
import { logger } from '../src/utils/logger.js';

const router = express.Router();

/**
 * 获取当前使用模式
 * GET /api/config/usage-mode
 */
router.get('/api/config/usage-mode', (req, res) => {
  try {
    const mode = configService.getUsageMode();
    const perfConfig = configService.getPerformanceConfig();

    res.json({
      success: true,
      mode,
      performance: perfConfig
    });
  } catch (error) {
    logger.error('获取使用模式失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 切换使用模式
 * POST /api/config/usage-mode
 */
router.post('/api/config/usage-mode', async (req, res) => {
  try {
    const { mode, service_config } = req.body;

    if (mode !== 'personal' && mode !== 'service') {
      return res.status(400).json({
        success: false,
        error: '无效的使用模式，必须是 personal 或 service'
      });
    }

    configService.setUsageMode(mode);

    if (mode === 'service' && service_config) {
      const currentPerf = configService.config.performance.service;

      if (service_config.rate_limit) {
        currentPerf.rate_limit = { ...currentPerf.rate_limit, ...service_config.rate_limit };
      }
      if (service_config.concurrent_requests !== undefined) {
        currentPerf.concurrent_requests = service_config.concurrent_requests;
      }
      if (service_config.cache_enabled !== undefined) {
        currentPerf.cache_enabled = service_config.cache_enabled;
      }
      if (service_config.cache_ttl !== undefined) {
        currentPerf.cache_ttl = service_config.cache_ttl;
      }
      if (service_config.max_tabs !== undefined) {
        currentPerf.max_tabs = service_config.max_tabs;
      }
      if (service_config.max_retries !== undefined) {
        currentPerf.max_retries = service_config.max_retries;
      }
      if (service_config.retry_delay !== undefined) {
        currentPerf.retry_delay = service_config.retry_delay;
      }
    }

    await configService.save();

    logger.info(`[CONFIG] 使用模式已切换为: ${mode}`);
    res.json({
      success: true,
      message: `使用模式已切换为 ${mode}`,
      mode,
      performance: configService.getPerformanceConfig()
    });
  } catch (error) {
    logger.error('切换使用模式失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取完整配置
 * GET /api/config
 */
router.get('/api/config', (req, res) => {
  try {
    const config = configService.config;

    res.json({
      success: true,
      config
    });
  } catch (error) {
    logger.error('获取配置失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 更新配置
 * POST /api/config
 */
router.post('/api/config', async (req, res) => {
  try {
    const { config } = req.body;

    if (!config || typeof config !== 'object') {
      return res.status(400).json({
        success: false,
        error: '无效的配置格式'
      });
    }

    for (const [key, value] of Object.entries(config)) {
      configService.set(key, value);
    }

    await configService.save();

    logger.info('[CONFIG] 配置已更新');
    res.json({
      success: true,
      message: '配置已更新',
      config: configService.config
    });
  } catch (error) {
    logger.error('更新配置失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取性能配置
 * GET /api/config/performance
 */
router.get('/api/config/performance', (req, res) => {
  try {
    const mode = configService.getUsageMode();
    const perfConfig = configService.getPerformanceConfig();

    res.json({
      success: true,
      mode,
      performance: perfConfig
    });
  } catch (error) {
    logger.error('获取性能配置失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 更新性能配置
 * POST /api/config/performance
 */
router.post('/api/config/performance', async (req, res) => {
  try {
    const { mode, config } = req.body;

    if (mode !== 'personal' && mode !== 'service') {
      return res.status(400).json({
        success: false,
        error: '无效的使用模式，必须是 personal 或 service'
      });
    }

    if (!config || typeof config !== 'object') {
      return res.status(400).json({
        success: false,
        error: '无效的配置格式'
      });
    }

    const currentPerf = configService.config.performance[mode];

    for (const [key, value] of Object.entries(config)) {
      if (currentPerf.hasOwnProperty(key)) {
        currentPerf[key] = value;
      }
    }

    await configService.save();

    logger.info(`[CONFIG] ${mode} 模式性能配置已更新`);
    res.json({
      success: true,
      message: '性能配置已更新',
      mode,
      performance: configService.getPerformanceConfig()
    });
  } catch (error) {
    logger.error('更新性能配置失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;