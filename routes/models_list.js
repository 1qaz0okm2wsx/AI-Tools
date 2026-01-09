/**
 * 模型列表路由 (ESM)
 */

import express from 'express';
import { logOperation } from '../db_init.js';
import ModelAnalyzerEnhanced from '../modelAnalyzer_enhanced.js';
import ModelAnalyzer from '../modelAnalyzer.js';

const router = express.Router();

/**
 * @param {any} req
 */
// 认证辅助函数
function authenticate(req) {
    const authHeader = req.headers['authorization'];
    const anthropicKey = req.headers['x-api-key'];
    const googleKey = req.headers['x-goog-api-key'] || req.query.key;

    // 只要有任何一种有效的认证方式即视为通过
    // 在实际生产中，这里应该对接真实的 API Key 校验逻辑
    if (authHeader && authHeader.startsWith('Bearer ')) return true;
    if (anthropicKey) return true;
    if (googleKey) return true;

    return false;
}

/**
 * @param {any} res
 * @param {number} status
 * @param {string} message
 * @param {string} type
 * @param {string|null} code
 */
// 错误响应辅助函数
function sendError(res, status, message, type = 'invalid_request_error', code = null) {
    return res.status(status).json({
        error: {
            message: message,
            type: type,
            param: null,
            code: code
        }
    });
}

// 列出可用模型
router.get('/v1/models', async (req, res) => {
    // 1. 认证检查
    if (!authenticate(req)) {
        return sendError(res, 401, '认证失败，请提供有效的 API Key', 'authentication_error', /** @type {any} */ ('invalid_api_key'));
    }

    try {
        // 2. 获取所有提供商的模型数据（直接从数据库 models 表获取，避免每次都去网络探测）
        const allModels = await new Promise((resolve, reject) => {
            global.db.all(`
                SELECT m.*, p.name as provider_name
                FROM models m
                JOIN providers p ON m.provider_id = p.id
                ORDER BY m.model_id ASC
            `, (/** @type {any} */ err, /** @type {any} */ rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });

        // 3. 识别返回格式
        const isAnthropic = req.headers['x-api-key'] && req.headers['anthropic-version'];
        const isGemini = req.headers['x-goog-api-key'] || req.query.key;

        // 4. 根据格式封装数据
        if (isAnthropic) {
            // Anthropic 格式
            const anthropicData = allModels.map((/** @type {any} */ m) => ({
                type: "model",
                id: m.model_id,
                display_name: m.model_name || m.model_id,
                created_at: m.created_at || new Date().toISOString()
            }));

            return res.json({
                data: anthropicData,
                has_more: false,
                first_id: anthropicData.length > 0 ? anthropicData[0].id : null,
                last_id: anthropicData.length > 0 ? anthropicData[anthropicData.length - 1].id : null
            });
        } else if (isGemini) {
            // Gemini 格式
            const geminiModels = allModels.map((/** @type {any} */ m) => ({
                name: `models/${m.model_id}`,
                version: "v1",
                displayName: m.model_name || m.model_id,
                description: m.description || "",
                supportedGenerationMethods: ["generateContent"]
            }));

            return res.json({
                models: geminiModels
            });
        } else {
            // 默认 OpenAI 格式
            const openaiData = allModels.map((/** @type {any} */ m) => ({
                id: m.model_id,
                object: "model",
                created: m.created_at ? Math.floor(new Date(m.created_at).getTime() / 1000) : Math.floor(Date.now() / 1000),
                owned_by: m.provider_name
            }));

            return res.json({
                object: 'list',
                data: openaiData
            });
        }

    } catch (/** @type {any} */ error) {
        console.error('列出模型失败:', error);
        return sendError(res, 500, `列出模型失败: ${error.message}`, 'internal_server_error');
    }
});

/**
 * @param {any} req
 * @param {any} res
 */
// 获取特定提供商的模型
router.get('/v1/models/:providerId', async (req, res) => {
    try {
        const providerId = req.params.providerId;

        // 获取提供商信息
        const provider = await new Promise((resolve, reject) => {
            global.db.get(`
                SELECT id, name, url
                FROM providers
                WHERE id = ?
            `, [providerId], (/** @type {any} */ err, /** @type {any} */ row) => {
                if (err) {
                    return reject(err);
                }
                resolve(row);
            });
        });

        if (!provider) {
            return res.status(404).json({
                error: {
                    message: '未找到指定的提供商',
                    code: 'provider_not_found'
                }
            });
        }

        // 检查是否有多个API密钥
        const hasMultipleKeys = await new Promise((resolve) => {
            global.db.get(`
                SELECT COUNT(*) as count FROM api_keys
                WHERE provider_id = ? AND is_active = 1
            `, [provider.id], (/** @type {any} */ err, /** @type {any} */ row) => {
                if (err) {
                    console.error(`检查提供商${provider.name}的API密钥失败:`, err.message);
                    resolve(false);
                } else {
                    resolve(row.count > 1);
                }
            });
        });

        // 根据是否有多个密钥选择不同的分析器
        let models;
        if (hasMultipleKeys) {
            const analyzer = new ModelAnalyzerEnhanced(provider);
            analyzer.setRotationStrategy('smart');
            analyzer.setMaxRequestsPerKey(30);
            models = await analyzer.detectModels();
        } else {
            // ModelAnalyzer 不需要构造函数参数，也不支持 setRotationStrategy 等方法
            const analyzer = new ModelAnalyzer();
            models = await analyzer.analyzeModels(provider);
        }

        // 只保留模型ID和名称，添加提供商信息
        const simplifiedModels = models.map((/** @type {any} */ model) => ({
            id: model.id,
            object: "model",
            created: model.created || null,
            owned_by: provider.name
        }));

        // 记录操作日志
        logOperation(global.db, 'LIST_MODELS', 'provider', providerId, provider.name,
                    `列出提供商 ${provider.name} 的模型，共 ${models.length} 个`, 'success', req);

        // 返回OpenAI格式的响应
        res.json({
            object: 'list',
            data: simplifiedModels
        });

    } catch (/** @type {any} */ error) {
        console.error(`列出提供商 ${req.params.providerId} 的模型失败:`, error);

        // 记录错误日志
        logOperation(global.db, 'LIST_MODELS', 'provider', req.params.providerId, 'unknown',
                    `列出模型失败: ${error.message}`, 'error', req);

        res.status(500).json({
            error: {
                message: '列出模型失败',
                details: error.message
            }
        });
    }
});

export default router;
