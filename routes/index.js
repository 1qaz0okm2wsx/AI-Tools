
/**
 * 主路由模块 (ESM)
 */

import express from 'express';
import { logOperation } from '../db_init.js';
import apiChecker from '../api_checker.js';
import { logger } from '../src/utils/logger.js';

const router = express.Router();

// 仪表盘页面
router.get('/dashboard', (req, res) => {
    res.render('dashboard');
});

// 主页路由
router.get('/', (/** @type {import('../src/types/index.js').Request} */ req, /** @type {import('../src/types/index.js').Response} */ res) => {
    const db = req.app?.locals?.db || /** @type {any} */ (globalThis).db;
    const page = parseInt(String(req.query.page)) || 1;
    const limit = 10; // 每页显示的提供商数量
    const offset = (page - 1) * limit;

    // 获取总提供商数
    db.get(`SELECT COUNT(*) as total FROM providers`, (err, countResult) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        const totalProviders = countResult?.total || 0;
        const totalPages = Math.ceil(totalProviders / limit);

        // 获取当前页的提供商数据
        db.all(`
            SELECT id, name, url, api_key, created_at
            FROM providers
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `, [limit, offset], (err, providers) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            // 为每个提供商获取模型列表
            /** @type {Array<import('../src/types/index.js').Provider & { models: import('../src/types/index.js').Model[] }>} */
            const providersWithModels = [];
            let completedRequests = 0;

            if (providers.length === 0) {
                // 如果没有提供商，直接渲染页面
                res.render('index', {
                    providers: [],
                    pagination: {
                        currentPage: page,
                        totalPages: totalPages,
                        totalItems: totalProviders,
                        hasNextPage: page < totalPages,
                        hasPrevPage: page > 1,
                        nextPage: page + 1,
                        prevPage: page - 1
                    }
                });
                return;
            }

            // 为每个提供商获取模型 - 获取完整的模型信息
            for (const provider of providers) {
                db.all(`
                    SELECT model_name, model_id, description, category, context_window, capabilities
                    FROM models
                    WHERE provider_id = ?
                    ORDER BY model_name
                `, [provider.id], (err, models) => {
                    if (err) {
                        logger.error(`获取提供商 ${provider.name} 的模型失败:`, err.message);
                        models = [];
                    }

                    // 解析capabilities JSON
                    const modelsWithParsedCapabilities = models.map(/** @type {import('../src/types/index.js').Model} */ model => {
                        if (model.capabilities) {
                            try {
                                model.capabilities = JSON.parse(String(model.capabilities));
                            } catch (/** @type {any} */ e) {
                                logger.error(`解析模型 ${model.model_name} 的capabilities失败:`, e.message);
                                model.capabilities = [];
                            }
                        }
                        return model;
                    });

                    providersWithModels.push({
                        ...provider,
                        models: modelsWithParsedCapabilities
                    });

                    completedRequests++;

                    // 当所有提供商的模型都获取完成后，渲染页面
                    if (completedRequests === providers.length) {
                        // 获取API状态
                        const apiStatusSummary = apiChecker.getApiStatusSummary();

                        res.render('index', {
                            providers: providersWithModels,
                            pagination: {
                                currentPage: page,
                                totalPages: totalPages,
                                totalItems: totalProviders,
                                hasNextPage: page < totalPages,
                                hasPrevPage: page > 1,
                                nextPage: page + 1,
                                prevPage: page - 1
                            },
                            apiStatus: apiStatusSummary
                        });
                    }
                });
            }
        });
    });
});

// 添加提供商页面
router.get('/add-provider', (req, res) => {
    res.render('add-provider');
});

// 额度统计页面
router.get('/billing', (req, res) => {
    res.render('billing');
});

// 手动检测所有提供商的模型
router.post('/detect-all-models', async (/** @type {import('../src/types/index.js').Request} */ req, /** @type {import('../src/types/index.js').Response} */ res) => {
    try {
        const db = req.app?.locals?.db || /** @type {any} */ (globalThis).db;
        const { autoDetectAllModels } = await import('./providers.js');
        const models = await autoDetectAllModels(db);

        // @ts-ignore
        logOperation(db, 'DETECT_ALL_MODELS', 'system', null, 'system',
                    `手动检测所有提供商模型，共检测到 ${models.length} 个模型`, 'success', req);

        res.json({
            success: true,
            message: `检测完成，共发现 ${models.length} 个模型`,
            count: models.length
        });
    } catch (/** @type {any} */ error) {
        // @ts-ignore
        const db = req.app?.locals?.db || /** @type {any} */ (globalThis).db;
        logOperation(db, 'DETECT_ALL_MODELS', 'system', null, 'system',
                    `手动检测所有提供商模型失败: ${error.message}`, 'error', req);

        res.status(500).json({
            success: false,
            message: `检测失败: ${error.message}`
        });
    }
});

// 获取API状态摘要
router.get('/api-status-summary', (/** @type {import('../src/types/index.js').Request} */ req, /** @type {import('../src/types/index.js').Response} */ res) => {
    try {
        const summary = apiChecker.getApiStatusSummary();
        res.json(summary);
    } catch (/** @type {any} */ error) {
        res.status(500).json({ error: error.message });
    }
});

// 获取所有API状态
router.get('/api-status', (/** @type {import('../src/types/index.js').Request} */ req, /** @type {import('../src/types/index.js').Response} */ res) => {
    try {
        const allStatus = apiChecker.getAllApiStatus();
        res.json(allStatus);
    } catch (/** @type {any} */ error) {
        res.status(500).json({ error: error.message });
    }
});

// 手动触发API检查
router.post('/check-api-status', async (/** @type {import('../src/types/index.js').Request} */ req, /** @type {import('../src/types/index.js').Response} */ res) => {
    try {
        const db = req.app?.locals?.db || /** @type {any} */ (globalThis).db;
        // 使用 Promise 包装数据库查询
        const providers = await new Promise((/** @type {(value: import('../src/types/index.js').Provider[]) => void} */ resolve, /** @type {(reason: Error) => void} */ reject) => {
            // @ts-ignore
            db.all('SELECT id, name, url FROM providers', (/** @type {Error | null} */ err, /** @type {import('../src/types/index.js').Provider[]} */ rows) => {
                if (err) {
                    return reject(err);
                }
                resolve(rows);
            });
        });

        // 执行检查
        const results = await apiChecker.checkAllApis(providers);

        // 记录操作日志
        // @ts-ignore
        logOperation(db, 'CHECK_API_STATUS', 'system', null, 'system',
                    `手动检查API状态，共检查${providers.length}个提供商`, 'success', req);

        res.json({
            message: 'API状态检查完成',
            results: results,
            summary: apiChecker.getApiStatusSummary()
        });
    } catch (/** @type {any} */ error) {
        res.status(500).json({ error: error.message });
    }
});
// 获取前端可用模型列表 (格式: { provider_id: [model_names...] })
router.get('/api/models', (/** @type {import('../src/types/index.js').Request} */ req, /** @type {import('../src/types/index.js').Response} */ res) => {
    const db = req.app?.locals?.db || /** @type {any} */ (globalThis).db;
    // 这里可以添加鉴权逻辑
    // const authHeader = req.headers.authorization;
    // if (!authHeader) return res.status(401).json({ success: false, message: "未授权访问" });

    // @ts-ignore
    db.all(`
        SELECT p.id as provider_id, m.model_id
        FROM providers p
        LEFT JOIN models m ON p.id = m.provider_id
        ORDER BY p.id, m.model_id
    `, (/** @type {Error | null} */ err, /** @type {Array<{ provider_id: number; model_id: string }>} */ rows) => {
        if (err) {
            return res.status(500).json({ success: false, message: err.message });
        }

        /** @type {Record<number, string[]>} */
        const data = {};
        rows.forEach(/** @type {{ provider_id: number; model_id: string }} */ row => {
            if (!data[row.provider_id]) {
                data[row.provider_id] = [];
            }
            if (row.model_id) {
                data[row.provider_id].push(row.model_id);
            }
        });

        res.json({
            success: true,
            data: data
        });
    });
});

// 仪表盘统计数据API
router.get('/api-dashboard-stats', async (/** @type {import('../src/types/index.js').Request} */ req, /** @type {import('../src/types/index.js').Response} */ res) => {
    try {
        const db = req.app?.locals?.db || /** @type {any} */ (globalThis).db;

        // 获取提供商数量
        const providersCount = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM providers', (/** @type {any} */ err, /** @type {{ count: number }} */ row) => {
                if (err) return reject(err);
                resolve(row.count);
            });
        });

        // 获取模型数量
        const modelsCount = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM models', (/** @type {any} */ err, /** @type {{ count: number }} */ row) => {
                if (err) return reject(err);
                resolve(row.count);
            });
        });

        // 获取今日请求数
        const todayStart = new Date().setHours(0, 0, 0, 0).toISOString();
        const requestsCount = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM token_logs WHERE request_time >= ?', [todayStart],
                (/** @type {any} */ err, /** @type {{ count: number }} */ row) => {
                    if (err) return reject(err);
                    resolve(row.count);
                });
        });

        // 获取今日成本
        const costResult = await new Promise((resolve, reject) => {
            db.get('SELECT SUM(cost) as total FROM token_logs WHERE request_time >= ?', [todayStart],
                (/** @type {any} */ err, /** @type {{ total: number }} */ row) => {
                    if (err) return reject(err);
                    resolve(row.total || 0);
                });
        });

        res.json({
            providers: providersCount,
            models: modelsCount,
            requests: requestsCount,
            cost: parseFloat(costResult.toFixed(4))
        });
    } catch (/** @type {any} */ error) {
        res.status(500).json({ error: error.message });
    }
});

// Token使用排行API
router.get('/token-ranking', async (/** @type {import('../src/types/index.js').Request} */ req, /** @type {import('../src/types/index.js').Response} */ res) => {
    try {
        const db = req.app?.locals?.db || /** @type {any} */ (globalThis).db;

        const todayStart = new Date().setHours(0, 0, 0, 0).toISOString();

        const rows = await new Promise((resolve, reject) => {
            db.all(`
                SELECT model_id, COUNT(*) as requests, SUM(total_tokens) as tokens
                FROM token_logs
                WHERE request_time >= ?
                GROUP BY model_id
                ORDER BY tokens DESC
                LIMIT 10
            `, [todayStart], (/** @type {any} */ err, /** @type {any[]} */ rows) => {
                if (err) return reject(err);
                resolve(rows || []);
            });
        });

        res.json(rows);
    } catch (/** @type {any} */ error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
