/**
 * 聊天代理路由 (ESM)
 */

import express from 'express';
import ModelAnalyzerEnhanced from '../modelAnalyzer_enhanced.js';
import { logOperation } from '../db_init.js';
import { logger } from '../src/utils/logger.js';

const router = express.Router();

// 错误响应辅助函数
/**
 * @param {any} res
 * @param {number} status
 * @param {string} message
 * @param {string} [type='invalid_request_error']
 * @param {string | null} [code]
 */
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

// 通用代理转发逻辑 (支持 Chat, Images, Audio, Videos)
/**
 * @param {any} req
 * @param {any} res
 * @param {string} endpoint
 */
async function handleProxyRequest(req, res, endpoint) {
    const { model, stream = false } = req.body;
    const body = req.body;

    // 1. 获取模型和提供商
    const modelId = model || body.model;
    if (!modelId && endpoint.includes('chat')) {
        return sendError(res, 400, 'model 是必填字段', 'invalid_request_error');
    }

    try {
        const provider = await new Promise((resolve, reject) => {
            let query = `SELECT p.* FROM providers p JOIN models m ON p.id = m.provider_id WHERE m.model_id = ? LIMIT 1`;
            let params = [modelId];
            
            // 如果是特殊任务（如视频生成）可能没有预注册模型，回退到第一个可用的通用提供商
            if (!modelId) {
                query = `SELECT * FROM providers LIMIT 1`;
                params = [];
            }

            /** @type {any} */ (global).db.get(query, params, (/** @type {any} */ err, /** @type {any} */ row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });

        if (!provider) {
            return sendError(res, 404, `未找到支持模型 ${modelId} 的渠道`, 'invalid_request_error');
        }

        const analyzer = new ModelAnalyzerEnhanced(provider);
        await analyzer.initApiKeys();

        // 2. 构建 URL
        let baseUrl = provider.url.endsWith('/') ? provider.url.slice(0, -1) : provider.url;
        let fullUrl = `${baseUrl}/${endpoint}`.replace(/([^:])\/\/+/g, '$1/');
        fullUrl = fullUrl.replace(/\/v1\/v1+/g, '/v1').replace(/\/api\/api+/g, '/api');

        // 3. 配置请求
        const requestConfig = {
            method: req.method,
            url: fullUrl,
            data: body,
            responseType: stream ? 'stream' : (endpoint.includes('audio') || endpoint.includes('video') ? 'arraybuffer' : 'json'),
            headers: {
                'x-channel-name': provider.name // 向下游传递渠道名称
            }
        };

        // 4. 发送请求并处理响应
        const response = await analyzer.makeRequest(requestConfig);

        if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            response.data.pipe(res);
        } else {
            // 处理二进制返回（音频/视频/图片）
            const contentType = response.headers['content-type'];
            if (contentType && (contentType.includes('audio') || contentType.includes('video') || contentType.includes('image'))) {
                res.setHeader('Content-Type', contentType);
                return res.send(response.data);
            }
            res.json(response.data);
        }

        // 记录使用情况
        logOperation(/** @type {any} */ (global).db, 'PROXY_REQUEST', 'model', provider.id, provider.name, `代理请求: ${endpoint}, 模型: ${modelId}`, 'success', req);

    } catch (/** @type {any} */ error) {
        logger.error(`代理请求 ${endpoint} 失败:`, error?.message || String(error));
        return sendError(res, error?.response?.status || 500, error?.message || String(error), 'proxy_error');
    }
}

// 注册所有 OpenAI 兼容路径
router.post('/v1/chat/completions', (req, res) => handleProxyRequest(req, res, 'chat/completions'));
router.post('/v1/images/generations', (req, res) => handleProxyRequest(req, res, 'images/generations'));
router.post('/v1/images/edits', (req, res) => handleProxyRequest(req, res, 'images/edits'));
router.post('/v1/audio/transcriptions', (req, res) => handleProxyRequest(req, res, 'audio/transcriptions'));
router.post('/v1/audio/speech', (req, res) => handleProxyRequest(req, res, 'audio/speech'));
router.post('/v1/audio/translations', (req, res) => handleProxyRequest(req, res, 'audio/translations'));
router.post('/v1/moderations', (req, res) => handleProxyRequest(req, res, 'moderations'));
router.post('/v1/embeddings', (req, res) => handleProxyRequest(req, res, 'embeddings'));

// 视频生成 (兼容 Sora/Kling)
router.post('/v1/videos/generations', (req, res) => handleProxyRequest(req, res, 'videos/generations'));
router.get('/v1/videos/:id', (req, res) => handleProxyRequest(req, res, `videos/${req.params.id}`));

// 查询个人额度/使用情况
router.get('/v1/dashboard/billing/usage', async (req, res) => {
    // 聚合 token_logs 表数据
    /** @type {any} */ (global).db.all(`SELECT model_id, SUM(total_tokens) as tokens, SUM(cost) as total_cost FROM token_logs GROUP BY model_id`, (/** @type {any} */ err, /** @type {any} */ rows) => {
        if (err) return sendError(res, 500, err?.message || String(err));
        res.json({ object: "list", data: rows });
    });
});

export default router;