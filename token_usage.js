
/**
 * 令牌使用记录模块 (ESM)
 */

import { logTokenUsage } from './routes/token_logs.js';
import { logger } from './src/utils/logger.js';

/**
 * 记录令牌使用情况的辅助函数
 * @param {any} db - 数据库实例
 * @param {number} providerId - 提供商ID
 * @param {string} modelId - 模型ID
 * @param {number} apiKeyId - API密钥ID
 * @param {any} response - API响应对象
 * @param {number} responseTime - 响应时间
 * @param {string} status - 状态
 * @param {string|null} errorMessage - 错误消息
 */
function recordTokenUsage(db, providerId, modelId, apiKeyId, response, responseTime, status, errorMessage = null) {
    try {
        // 提取令牌使用信息
        let requestTokens = 0;
        let responseTokens = 0;
        let cost = 0;

        // 从响应体中提取令牌使用信息
        if (response.data && response.data.usage) {
            requestTokens = response.data.usage.prompt_tokens || 0;
            responseTokens = response.data.usage.completion_tokens || 0;
            cost = calculateCost(modelId, requestTokens, responseTokens);
        }

        // 记录令牌使用情况
        logTokenUsage(
            db,
            providerId,
            modelId,
            apiKeyId,
            requestTokens,
            responseTokens,
            cost,
            responseTime,
            status,
            errorMessage
        );
    } catch (/** @type {any} */ error) {
        logger.error('记录令牌使用失败:', error.message);
    }
}

/**
 * 从响应中提取模型ID
 * @param {any} response - API响应对象
 * @returns {string} 模型ID
 */
function extractModelFromResponse(response) {
    if (response.data && response.data.model) {
        return response.data.model;
    }

    if (response.config && response.config.url) {
        // 尝试从URL中提取模型ID
        const urlParts = response.config.url.split('/');
        const modelsEndpoint = urlParts.findIndex(/** @param {string} part */ part => part === 'models');

        if (modelsEndpoint !== -1 && urlParts.length > modelsEndpoint + 1) {
            return urlParts[modelsEndpoint + 1];
        }
    }

    return 'unknown';
}

/**
 * 计算API调用成本
 * @param {string} modelId - 模型ID
 * @param {number} requestTokens - 请求令牌数
 * @param {number} responseTokens - 响应令牌数
 * @returns {number} 成本
 */
function calculateCost(modelId, requestTokens, responseTokens) {
    // 简化的成本计算，实际应根据不同提供商和模型调整
    const totalTokens = requestTokens + responseTokens;

    // OpenAI模型定价示例 (2023年价格)
    if (modelId && modelId.includes('gpt-4')) {
        return (totalTokens / 1000) * 0.03; // $0.03 per 1K tokens
    } else if (modelId && modelId.includes('gpt-3.5-turbo')) {
        return (totalTokens / 1000) * 0.002; // $0.002 per 1K tokens
    } else {
        // 默认定价
        return (totalTokens / 1000) * 0.001; // $0.001 per 1K tokens
    }
}

export { recordTokenUsage, extractModelFromResponse, calculateCost };
