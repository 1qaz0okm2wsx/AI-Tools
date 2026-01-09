/**
 * 统计和监控API路由
 */

import express from 'express';
import { getDatabase, query } from '../src/utils/dbHelper.js';
import { logger } from '../src/utils/logger.js';
import metricsCollector from '../src/services/metrics.js';
import rateLimiter from '../src/services/rateLimiter.js';
import loadBalancer from '../src/services/loadBalancer.js';
import cacheManager from '../src/services/cache.js';
import circuitBreaker from '../src/services/circuitBreaker.js';
import concurrencyManager from '../src/services/concurrency.js';

const router = express.Router();

/**
 * 获取API密钥使用统计
 * GET /api/stats/api-keys
 */
router.get('/api/stats/api-keys', async (req, res) => {
  try {
    const db = getDatabase(req);
    if (!db) {
      return res.status(500).json({
        success: false,
        error: '数据库连接不可用'
      });
    }

    const { providerId, modelId, startDate, endDate } = req.query;

    let sql = `
      SELECT 
        ak.id,
        ak.key_name,
        ak.provider_id,
        p.name as provider_name,
        COUNT(tl.id) as request_count,
        SUM(tl.total_tokens) as total_tokens,
        SUM(tl.cost) as total_cost,
        MIN(tl.response_time_ms) as min_response_time,
        MAX(tl.response_time_ms) as max_response_time,
        AVG(tl.response_time_ms) as avg_response_time
      FROM api_keys ak
      LEFT JOIN providers p ON ak.provider_id = p.id
      LEFT JOIN token_logs tl ON ak.id = tl.api_key_id
      WHERE 1=1
    `;
    const params = [];

    if (providerId) {
      sql += ' AND ak.provider_id = ?';
      params.push(providerId);
    }

    if (modelId) {
      sql += ' AND tl.model_id = ?';
      params.push(modelId);
    }

    if (startDate) {
      sql += ' AND tl.request_time >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND tl.request_time <= ?';
      params.push(endDate);
    }

    sql += ' GROUP BY ak.id ORDER BY request_count DESC';

    const stats = await query(db, sql, params);

    res.json({
      success: true,
      count: stats.length,
      data: stats
    });
  } catch (error) {
    logger.error('获取API密钥统计失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取模型调用频率统计
 * GET /api/stats/models
 */
router.get('/api/stats/models', async (req, res) => {
  try {
    const db = getDatabase(req);
    if (!db) {
      return res.status(500).json({
        success: false,
        error: '数据库连接不可用'
      });
    }

    const { providerId, days = 7 } = req.query;

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const sql = `
      SELECT 
        m.model_id,
        m.model_name,
        p.name as provider_name,
        COUNT(tl.id) as request_count,
        SUM(tl.total_tokens) as total_tokens,
        SUM(tl.cost) as total_cost,
        AVG(tl.response_time_ms) as avg_response_time,
        COUNT(DISTINCT tl.api_key_id) as unique_keys
      FROM models m
      LEFT JOIN providers p ON m.provider_id = p.id
      LEFT JOIN token_logs tl ON m.model_id = tl.model_id
      WHERE tl.request_time >= ?
    `;
    const params = [startDate];

    if (providerId) {
      sql += ' AND m.provider_id = ?';
      params.push(providerId);
    }

    sql += ' GROUP BY m.model_id ORDER BY request_count DESC';

    const stats = await query(db, sql, params);

    res.json({
      success: true,
      count: stats.length,
      period: `${days} days`,
      data: stats
    });
  } catch (error) {
    logger.error('获取模型调用频率统计失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取提供商性能对比
 * GET /api/stats/providers/performance
 */
router.get('/api/stats/providers/performance', async (req, res) => {
  try {
    const db = getDatabase(req);
    if (!db) {
      return res.status(500).json({
        success: false,
        error: '数据库连接不可用'
      });
    }

    const { days = 7 } = req.query;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const sql = `
      SELECT 
        p.id,
        p.name,
        p.url,
        COUNT(tl.id) as request_count,
        SUM(tl.total_tokens) as total_tokens,
        SUM(tl.cost) as total_cost,
        AVG(tl.response_time_ms) as avg_response_time,
        MIN(tl.response_time_ms) as min_response_time,
        MAX(tl.response_time_ms) as max_response_time,
        COUNT(DISTINCT tl.api_key_id) as unique_keys,
        SUM(CASE WHEN tl.status = 'success' THEN 1 ELSE 0 END) as successful_requests,
        SUM(CASE WHEN tl.status != 'success' THEN 1 ELSE 0 END) as failed_requests
      FROM providers p
      LEFT JOIN token_logs tl ON p.id = tl.provider_id
      WHERE tl.request_time >= ?
      GROUP BY p.id
      ORDER BY request_count DESC
    `;

    const stats = await query(db, sql, [startDate]);

    res.json({
      success: true,
      count: stats.length,
      period: `${days} days`,
      data: stats
    });
  } catch (error) {
    logger.error('获取提供商性能对比失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取实时监控数据
 * GET /api/monitoring/realtime
 */
router.get('/api/monitoring/realtime', (req, res) => {
  try {
    const metrics = metricsCollector.getMetrics();

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: metrics
    });
  } catch (error) {
    logger.error('获取实时监控数据失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取限流统计
 * GET /api/monitoring/rate-limit
 */
router.get('/api/monitoring/rate-limit', (req, res) => {
  try {
    const stats = rateLimiter.getStats();

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: stats
    });
  } catch (error) {
    logger.error('获取限流统计失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取负载均衡统计
 * GET /api/monitoring/load-balancer
 */
router.get('/api/monitoring/load-balancer', (req, res) => {
  try {
    const stats = loadBalancer.getStats();

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: stats
    });
  } catch (error) {
    logger.error('获取负载均衡统计失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取缓存统计
 * GET /api/monitoring/cache
 */
router.get('/api/monitoring/cache', (req, res) => {
  try {
    const stats = cacheManager.getStats();

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: stats
    });
  } catch (error) {
    logger.error('获取缓存统计失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取熔断器统计
 * GET /api/monitoring/circuit-breaker
 */
router.get('/api/monitoring/circuit-breaker', (req, res) => {
  try {
    const stats = circuitBreaker.getStats();

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: stats
    });
  } catch (error) {
    logger.error('获取熔断器统计失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取并发管理统计
 * GET /api/monitoring/concurrency
 */
router.get('/api/monitoring/concurrency', (req, res) => {
  try {
    const stats = concurrencyManager.getStats();

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: stats
    });
  } catch (error) {
    logger.error('获取并发管理统计失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取系统概览
 * GET /api/monitoring/overview
 */
router.get('/api/monitoring/overview', (req, res) => {
  try {
    const metrics = metricsCollector.getMetrics();
    const rateLimitStats = rateLimiter.getStats();
    const loadBalancerStats = loadBalancer.getStats();
    const cacheStats = cacheManager.getStats();
    const circuitBreakerStats = circuitBreaker.getStats();
    const concurrencyStats = concurrencyManager.getStats();

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        metrics,
        rateLimit: rateLimitStats,
        loadBalancer: loadBalancerStats,
        cache: cacheStats,
        circuitBreaker: circuitBreakerStats,
        concurrency: concurrencyStats
      }
    });
  } catch (error) {
    logger.error('获取系统概览失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 重置监控指标
 * POST /api/monitoring/reset
 */
router.post('/api/monitoring/reset', (req, res) => {
  try {
    const { type } = req.body;

    switch (type) {
      case 'metrics':
        metricsCollector.reset();
        break;
      case 'rate-limit':
        rateLimiter.resetStats();
        break;
      case 'load-balancer':
        loadBalancer.resetStats();
        break;
      case 'cache':
        cacheManager.resetStats();
        break;
      case 'circuit-breaker':
        circuitBreaker.resetAll();
        break;
      case 'concurrency':
        concurrencyManager.resetStats();
        break;
      case 'all':
      default:
        metricsCollector.reset();
        rateLimiter.resetStats();
        loadBalancer.resetStats();
        cacheManager.resetStats();
        circuitBreaker.resetAll();
        concurrencyManager.resetStats();
        break;
    }

    logger.info(`[MONITORING] 已重置监控指标: ${type || 'all'}`);

    res.json({
      success: true,
      message: `已重置监控指标: ${type || 'all'}`
    });
  } catch (error) {
    logger.error('重置监控指标失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;