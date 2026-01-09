
/**
 * 令牌日志路由 (ESM)
 */

import express from 'express';
import { logOperation } from '../db_init.js';

const router = express.Router();

/**
 * 创建令牌使用日志表
 * @param {any} db - 数据库实例
 */
function createTokenLogsTable(db) {
    db.run(`CREATE TABLE IF NOT EXISTS token_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id INTEGER NOT NULL,
        model_id TEXT NOT NULL,
        api_key_id INTEGER,
        request_tokens INTEGER DEFAULT 0,
        response_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        cost DECIMAL(10, 6) DEFAULT 0.000000,
        request_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        response_time_ms INTEGER,
        status TEXT NOT NULL,
        error_message TEXT,
        FOREIGN KEY (provider_id) REFERENCES providers (id) ON DELETE CASCADE,
        FOREIGN KEY (api_key_id) REFERENCES api_keys (id) ON DELETE SET NULL
    )`, (/** @type {any} */ err) => {
        if (err) {
            console.error('创建token_logs表失败:', err);
        } else {
            console.log('token_logs表创建成功');

            // 添加索引
            db.run(`CREATE INDEX IF NOT EXISTS idx_token_logs_provider_id ON token_logs(provider_id)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_token_logs_model_id ON token_logs(model_id)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_token_logs_request_time ON token_logs(request_time DESC)`);
        }
    });
}

// 初始化表函数 - 由主程序调用
export function initTokenLogsTable() {
    if (global.db) {
        createTokenLogsTable(global.db);
    }
}

/**
 * 记录令牌使用情况
 * @param {any} db - 数据库实例
 * @param {number} providerId - 提供商ID
 * @param {string} modelId - 模型ID
 * @param {number} apiKeyId - API密钥ID
 * @param {number} requestTokens - 请求令牌数
 * @param {number} responseTokens - 响应令牌数
 * @param {number} cost - 成本
 * @param {number} responseTimeMs - 响应时间(毫秒)
 * @param {string} status - 状态
 * @param {string|null} errorMessage - 错误消息
 */
function logTokenUsage(db, providerId, modelId, apiKeyId, requestTokens, responseTokens, cost, responseTimeMs, status, errorMessage) {
    const totalTokens = requestTokens + responseTokens;

    db.run(`
        INSERT INTO token_logs (provider_id, model_id, api_key_id, request_tokens, response_tokens, total_tokens, cost, response_time_ms, status, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [providerId, modelId, apiKeyId, requestTokens, responseTokens, totalTokens, cost, responseTimeMs, status, errorMessage], 
    function(/** @type {any} */ err) {
        if (err) {
            console.error('记录令牌使用失败:', err);
        }
    });
}

// 获取令牌使用日志
/**
 * @param {any} req
 * @param {any} res
 */
router.get('/api/log/token', (req, res) => {
    const page = parseInt(String(req.query.page || '1')) || 1;
    const limit = parseInt(String(req.query.limit || '20')) || 20;
    const offset = (page - 1) * limit;
    /** @type {string|undefined} */
    const providerId = /** @type {any} */ (req.query.providerId);
    /** @type {string|undefined} */
    const modelId = /** @type {any} */ (req.query.modelId);
    /** @type {string|undefined} */
    const startDate = /** @type {any} */ (req.query.startDate);
    /** @type {string|undefined} */
    const endDate = /** @type {any} */ (req.query.endDate);

    // 构建查询条件
    let whereClause = 'WHERE 1=1';
    let queryParams = [];

    if (providerId) {
        whereClause += ' AND tl.provider_id = ?';
        queryParams.push(providerId);
    }

    if (modelId) {
        whereClause += ' AND tl.model_id LIKE ?';
        queryParams.push(`%${modelId}%`);
    }

    if (startDate) {
        whereClause += ' AND tl.request_time >= ?';
        queryParams.push(startDate);
    }

    if (endDate) {
        whereClause += ' AND tl.request_time <= ?';
        queryParams.push(endDate);
    }

    // 获取总数
    global.db.get(`
        SELECT COUNT(*) as total FROM token_logs tl
        ${whereClause}
    `, queryParams, (/** @type {any} */ err, /** @type {any} */ countResult) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        const totalLogs = countResult.total;
        const totalPages = Math.ceil(totalLogs / limit);

        // 获取分页数据
        global.db.all(`
            SELECT tl.id, tl.provider_id, p.name as provider_name, tl.model_id, 
                   tl.api_key_id, ak.key_name, tl.request_tokens, tl.response_tokens, 
                   tl.total_tokens, tl.cost, tl.request_time, tl.response_time_ms, 
                   tl.status, tl.error_message
            FROM token_logs tl
            LEFT JOIN providers p ON tl.provider_id = p.id
            LEFT JOIN api_keys ak ON tl.api_key_id = ak.id
            ${whereClause}
            ORDER BY tl.request_time DESC
            LIMIT ? OFFSET ?
        `, [...queryParams, limit, offset], (/** @type {any} */ err, /** @type {any} */ logs) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            // 格式化时间
            logs.forEach((/** @type {any} */ log) => {
                log.formatted_time = new Date(log.request_time).toLocaleString('zh-CN');
            });

            res.json({
                logs,
                pagination: {
                    currentPage: page,
                    totalPages: totalPages,
                    totalItems: totalLogs,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1,
                    nextPage: page + 1,
                    prevPage: page - 1
                }
            });
        });
    });
});

// 获取令牌使用统计
/**
 * @param {any} req
 * @param {any} res
 */
router.get('/api/log/token/stats', (req, res) => {
    /** @type {string|undefined} */
    const providerId = /** @type {any} */ (req.query.providerId);
    /** @type {string|undefined} */
    const modelId = /** @type {any} */ (req.query.modelId);
    const days = parseInt(String(req.query.days || '30')) || 30;

    // 计算起始日期
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // 构建查询条件
    let whereClause = 'WHERE request_time >= ?';
    let queryParams = [startDate.toISOString()];

    if (providerId) {
        whereClause += ' AND provider_id = ?';
        queryParams.push(providerId);
    }

    if (modelId) {
        whereClause += ' AND model_id LIKE ?';
        queryParams.push(`%${modelId}%`);
    }

    // 获取统计数据
    global.db.all(`
        SELECT 
            provider_id,
            model_id,
            COUNT(*) as request_count,
            SUM(request_tokens) as total_request_tokens,
            SUM(response_tokens) as total_response_tokens,
            SUM(total_tokens) as total_tokens,
            SUM(cost) as total_cost,
            AVG(response_time_ms) as avg_response_time,
            MIN(request_time) as first_request,
            MAX(request_time) as last_request
        FROM token_logs
        ${whereClause}
        GROUP BY provider_id, model_id
        ORDER BY total_tokens DESC
    `, queryParams, (/** @type {any} */ err, /** @type {any} */ stats) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        // 格式化时间
        stats.forEach((/** @type {any} */ stat) => {
            stat.first_request = stat.first_request ? new Date(stat.first_request).toLocaleString('zh-CN') : null;
            stat.last_request = stat.last_request ? new Date(stat.last_request).toLocaleString('zh-CN') : null;
        });

        // 计算总计
        const totals = {
            request_count: stats.reduce((/** @type {any} */ sum, /** @type {any} */ s) => sum + s.request_count, 0),
            total_request_tokens: stats.reduce((/** @type {any} */ sum, /** @type {any} */ s) => sum + s.total_request_tokens, 0),
            total_response_tokens: stats.reduce((/** @type {any} */ sum, /** @type {any} */ s) => sum + s.total_response_tokens, 0),
            total_tokens: stats.reduce((/** @type {any} */ sum, /** @type {any} */ s) => sum + s.total_tokens, 0),
            total_cost: stats.reduce((/** @type {any} */ sum, /** @type {any} */ s) => sum + s.total_cost, 0),
            avg_response_time: stats.length > 0 ? stats.reduce((/** @type {any} */ sum, /** @type {any} */ s) => sum + s.avg_response_time, 0) / stats.length : 0
        };

        res.json({
            stats,
            totals,
            period: {
                days: days,
                start_date: startDate.toLocaleDateString('zh-CN'),
                end_date: new Date().toLocaleDateString('zh-CN')
            }
        });
    });
});

export { router as default, logTokenUsage };
