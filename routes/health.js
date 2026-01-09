
/**
 * 健康检查路由 (ESM)
 */

import express from 'express';
import http from 'http';
import { logOperation } from '../db_init.js';
import memoryManager from '../memory_manager.js';
import { logger } from '../src/utils/logger.js';

const router = express.Router();

/** @type {{ timestamp: Date, status: string, data?: any, message?: string, error?: string } | null} */
let lastHealthCheck = null;

// 健康检查函数
function performHealthCheck() {
    const healthCheckUrl = process.env.HEALTH_CHECK_URL || 'http://localhost:3000/health';

    const req = http.request(healthCheckUrl, (res) => {
        let data = '';

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            try {
                const healthData = JSON.parse(data);
                lastHealthCheck = {
                    timestamp: new Date(),
                    status: res.statusCode === 200 ? 'healthy' : 'unhealthy',
                    data: healthData
                };

                // 如果健康检查失败，记录到日志
                if (res.statusCode !== 200) {
                    logOperation(global.db, 'HEALTH_CHECK', 'system', null, 'system',
                                `健康检查失败: ${res.statusCode}`, 'error', null);
                }
            } catch (/** @type {any} */ e) {
                logger.error('解析健康检查响应失败:', e);
                lastHealthCheck = {
                    timestamp: new Date(),
                    status: 'error',
                    message: '解析健康检查响应失败',
                    error: e.message
                };
            }
        });
    });

    req.on('error', (e) => {
        logger.error('健康检查请求失败:', e);
        lastHealthCheck = {
            timestamp: new Date(),
            status: 'error',
            message: '健康检查请求失败',
            error: e.message
        };

        logOperation(global.db, 'HEALTH_CHECK', 'system', null, 'system',
                    '健康检查请求失败', 'error', null);
    });

    req.on('timeout', () => {
        logger.error('健康检查请求超时');
        lastHealthCheck = {
            timestamp: new Date(),
            status: 'error',
            message: '健康检查请求超时'
        };

        req.destroy();

        logOperation(global.db, 'HEALTH_CHECK', 'system', null, 'system',
                    '健康检查请求超时', 'error', null);
    });

    req.setTimeout(5000); // 5秒超时
    req.end();
}

// 启动健康检查
function startHealthCheck() {
    // 延迟10秒后再开始健康检查，确保服务器已完全启动
    setTimeout(() => {
        // 立即执行一次健康检查
        performHealthCheck();

        // 设置定期健康检查
        setInterval(performHealthCheck, 60000); // 每分钟检查一次
    }, 10000);
}

// 健康检查端点
router.get('/health', (req, res) => {
    try {
        const memUsage = process.memoryUsage();
        const uptime = process.uptime();

        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: {
                seconds: Math.floor(uptime),
                human: formatUptime(uptime)
            },
            memory: {
                rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
                heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
                heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
                external: `${Math.round(memUsage.external / 1024 / 1024)} MB`
            },
            version: process.env.npm_package_version || '1.0.0',
            node: process.version
        });
    } catch (/** @type {any} */ error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// 获取最近一次健康检查结果的接口
router.get('/health-status', (req, res) => {
    if (!lastHealthCheck) {
        return res.json({
            status: 'no_checks',
            message: '尚未执行健康检查'
        });
    }

    res.json(lastHealthCheck);
});

// 获取实时内存使用情况
router.get('/memory-status', (req, res) => {
    try {
        const memoryUsage = memoryManager.getRealtimeMemoryUsage();
        res.json(memoryUsage);
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
});

// 手动触发内存清理
router.post('/cleanup-memory', (req, res) => {
    try {
        memoryManager.performCleanup();
        logOperation(global.db, 'MEMORY_CLEANUP', 'system', null, 'system',
                    '手动触发内存清理', 'success', req);

        res.json({
            success: true,
            message: '内存清理已执行'
        });
    } catch (error) {
        logOperation(global.db, 'MEMORY_CLEANUP', 'system', null, 'system',
                    `手动触发内存清理失败: ${error instanceof Error ? error.message : String(error)}`, 'error', req);

        res.status(500).json({
            success: false,
            message: `内存清理失败: ${error instanceof Error ? error.message : String(error)}`
        });
    }
});

/**
 * @param {number} seconds
 * @returns {string}
 */
function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    let result = '';

    if (days > 0) {
        result += `${days}天 `;
    }

    if (hours > 0 || days > 0) {
        result += `${hours}小时 `;
    }

    if (minutes > 0 || hours > 0 || days > 0) {
        result += `${minutes}分钟 `;
    }

    result += `${secs}秒`;

    return result;
}

export { router as default, startHealthCheck };
