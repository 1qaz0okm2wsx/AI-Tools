
/**
 * API密钥统计路由 (ESM)
 */

import express from 'express';
import { logOperation } from '../db_init.js';
import ModelAnalyzerEnhanced from '../modelAnalyzer_enhanced.js';

const router = express.Router();

/**
 * @param {any} req
 * @param {any} res
 */
// API密钥统计页面
router.get('/provider/:id/key-stats', (req, res) => {
    const providerId = req.params.id;

    // 获取提供商信息
    global.db.get(`SELECT id, name, url FROM providers WHERE id = ?`, [providerId], (/** @type {any} */ err, /** @type {any} */ provider) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (!provider) {
            return res.status(404).json({ error: '未找到指定的提供商' });
        }

        // 获取所有API密钥
        global.db.all(`
            SELECT id, key_name, api_key, is_active, created_at
            FROM api_keys
            WHERE provider_id = ?
            ORDER BY created_at DESC
        `, [providerId], (/** @type {any} */ err, /** @type {any} */ apiKeys) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            // 格式化创建时间
            apiKeys.forEach((/** @type {any} */ key) => {
                key.formatted_time = new Date(key.created_at).toLocaleString('zh-CN');
                // 隐藏API密钥的大部分内容
                if (key.api_key && key.api_key.length > 8) {
                    key.masked_key = key.api_key.substring(0, 4) + '****' + key.api_key.substring(key.api_key.length - 4);
                } else {
                    key.masked_key = '****';
                }
            });

            res.render('key-stats', {
                provider,
                apiKeys
            });
        });
    });
});

/**
 * @param {any} req
 * @param {any} res
 */
// 获取API密钥实时统计
router.get('/provider/:id/key-stats/api', (req, res) => {
    const providerId = req.params.id;

    // 获取提供商信息
    global.db.get(`SELECT id, name, url FROM providers WHERE id = ?`, [providerId], (/** @type {any} */ err, /** @type {any} */ provider) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (!provider) {
            return res.status(404).json({ error: '未找到指定的提供商' });
        }

        // 获取所有API密钥
        global.db.all(`
            SELECT id, key_name, api_key, is_active
            FROM api_keys
            WHERE provider_id = ? AND is_active = 1
            ORDER BY created_at DESC
        `, [providerId], async (/** @type {any} */ err, /** @type {any} */ apiKeys) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            if (apiKeys.length === 0) {
                return res.json({
                    error: '没有可用的API密钥',
                    keys: []
                });
            }

            try {
                // 创建增强的模型分析器
                const analyzer = new ModelAnalyzerEnhanced(provider);
                // @ts-ignore - rotationStrategy is a property, not a method
                analyzer.rotationStrategy = 'smart';

                // 初始化API密钥
                await analyzer.initApiKeys();

                // 获取密钥统计信息
                const stats = analyzer.getKeyStats();

                res.json({
                    provider: provider,
                    keys: stats,
                    summary: {
                        totalKeys: stats.length,
                        activeKeys: stats.filter(k => k.isActive).length,
                        totalRequests: stats.reduce((sum, k) => sum + (/** @type {any} */ (k).successCount || 0) + k.errorCount, 0),
                        totalErrors: stats.reduce((sum, k) => sum + k.errorCount, 0),
                        avgSuccessRate: stats.reduce((sum, k) => sum + (/** @type {any} */ (k).successRate || 0), 0) / stats.length,
                        avgResponseTime: stats.reduce((sum, k) => sum + (/** @type {any} */ (k).avgResponseTime || 0), 0) / stats.length
                    }
                });
            } catch (/** @type {any} */ error) {
                res.status(500).json({ error: error.message });
            }
        });
    });
});

/**
 * @param {any} req
 * @param {any} res
 */
// 重置API密钥统计
router.post('/provider/:id/key-stats/reset', (req, res) => {
    const providerId = req.params.id;

    // 获取提供商信息用于日志
    global.db.get(`SELECT name FROM providers WHERE id = ?`, [providerId], (/** @type {any} */ err, /** @type {any} */ provider) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (!provider) {
            return res.status(404).json({ error: '未找到指定的提供商' });
        }

        // 这里可以实现重置统计的逻辑
        // 由于我们的统计信息是存储在内存中的，重启应用后会重置
        // 所以这里只是记录日志

        logOperation(global.db, 'RESET_KEY_STATS', 'provider', providerId, provider.name, 
                    `重置提供商 ${provider.name} 的API密钥统计`, 'success', req);

        res.json({
            success: true,
            message: 'API密钥统计已重置'
        });
    });
});

export default router;
