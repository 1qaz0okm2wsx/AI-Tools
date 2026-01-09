
/**
 * @typedef {Object} ApiKey
 * @property {number} id
 * @property {string} api_key
 * @property {string} key_name
 * @property {string} [name]
 */

/**
 * @typedef {Object} Provider
 * @property {number} id
 * @property {string} name
 * @property {string} url
 */

/**
 * @typedef {Object} AxiosRequestConfig
 * @property {string} method
 * @property {string} url
 * @property {any} [data]
 * @property {Record<string, string>} [headers]
 * @property {number} [timeout]
 */

/**
 * 增强型模型分析器 (ESM)
 */

import axios from 'axios';
import { getAllAvailableApiKeys } from './routes/api_keys.js';
import { recordTokenUsage } from './token_usage.js';
import { logger } from './src/utils/logger.js';

class ModelAnalyzerEnhanced {
    /**
     * @param {Provider} provider
     */
    constructor(provider) {
        this.provider = provider;
        /** @type {ApiKey[]} */
        this.apiKeys = [];
        this.currentKeyIndex = 0;
        this.lastKeyRotation = Date.now();
        this.keyRotationInterval = 5 * 60 * 1000; // 5分钟轮换一次密钥
        this.requestCount = 0; // 请求计数
        this.maxRequestsPerKey = 50; // 每个密钥最大请求数
        this.rotationStrategy = 'round-robin'; // 简化为轮询策略
        /** @type {Record<number, number>} */
        this.errorCounts = {}; // 记录每个密钥的错误次数
        /** @type {Set<number>} */
        this.blacklistedKeys = new Set(); // 临时黑名单
    }

    // 初始化API密钥
    async initApiKeys() {
        return new Promise((resolve, reject) => {
            getAllAvailableApiKeys(this.provider.id, (/** @type {Error | null} */ err, /** @type {any[] | null} */ keys) => {
                if (err) {
                    return reject(err);
                }

                if (!keys) {
                    return reject(new Error('No keys found'));
                }

                this.apiKeys = /** @type {ApiKey[]} */ (keys);
                this.currentKeyIndex = 0;

                // 初始化统计信息
                keys.forEach((/** @type {ApiKey} */ key) => {
                    if (!this.errorCounts[key.id]) {
                        this.errorCounts[key.id] = 0;
                    }
                });

                logger.info(`提供商 ${this.provider.name} 初始化了 ${keys.length} 个API密钥`);
                resolve(keys);
            });
        });
    }

    // 获取当前API密钥
    getCurrentApiKey() {
        // 如果没有初始化密钥，先初始化
        if (this.apiKeys.length === 0) {
            throw new Error('API密钥未初始化');
        }

        return this.apiKeys[this.currentKeyIndex].api_key;
    }

    // 轮换API密钥 (简化版)
    rotateKey(reason = 'scheduled') {
        if (this.apiKeys.length <= 1) return;

        const oldKeyIndex = this.currentKeyIndex;
        let attempts = 0;
        
        // 寻找下一个非黑名单的密钥
        do {
            this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
            attempts++;
        } while (
            this.blacklistedKeys.has(this.apiKeys[this.currentKeyIndex].id) &&
            attempts < this.apiKeys.length
        );

        // 如果所有密钥都在黑名单中，强制重置黑名单（或者保持当前索引，等待重试逻辑处理）
        if (attempts >= this.apiKeys.length) {
            logger.warn(`提供商 ${this.provider.name} 所有密钥均在黑名单中，重置黑名单`);
            this.blacklistedKeys.clear();
            this.currentKeyIndex = (oldKeyIndex + 1) % this.apiKeys.length;
        }

        this.requestCount = 0; // 重置请求计数

        const oldKeyName = this.apiKeys[oldKeyIndex].key_name;
        const newKeyName = this.apiKeys[this.currentKeyIndex].key_name;

        logger.info(`提供商 ${this.provider.name} 轮换API密钥: ${oldKeyName} -> ${newKeyName} (原因: ${reason})`);
    }

    // 暂时拉黑密钥
    /**
     * @param {number} keyId
     * @param {number} [duration]
     */
    blacklistKey(keyId, duration = 60000) {
        this.blacklistedKeys.add(keyId);
        logger.info(`密钥 ID ${keyId} 已暂时拉黑 ${duration}ms`);
        setTimeout(() => {
            this.blacklistedKeys.delete(keyId);
            logger.info(`密钥 ID ${keyId} 已移出黑名单`);
        }, duration);
    }

    // 设置每个密钥的最大请求数
    /**
     * @param {number} count
     */
    setMaxRequestsPerKey(count) {
        this.maxRequestsPerKey = count;
        logger.info(`提供商 ${this.provider.name} 每个密钥最大请求数设置为: ${count}`);
    }

    // 使用当前API密钥发送请求
    /**
     * @param {AxiosRequestConfig} config
     */
    async makeRequest(config) {
        // 确保API密钥已初始化
        if (this.apiKeys.length === 0) {
            await this.initApiKeys();
        }

        let lastError = null;
        let attempts = 0;
        const maxAttempts = this.apiKeys.length;

        // 检查是否需要轮换密钥 (基于请求数或简单的轮询)
        if (this.requestCount >= this.maxRequestsPerKey) {
            this.rotateKey('max_requests');
        }

        // 尝试使用每个可用的API密钥
        while (attempts < maxAttempts) {
            const startTime = Date.now();
            const currentKeyId = this.apiKeys[this.currentKeyIndex].id;
            const keyName = this.apiKeys[this.currentKeyIndex].key_name;

            try {
                const currentKey = this.getCurrentApiKey();

                // 智能识别提供商类型并设置正确的认证头和格式转换
                const providerType = this.identifyProviderType();
                
                // 设置 API 密钥
                if (providerType === 'openai') {
                    config.headers = {
                        'Authorization': `Bearer ${currentKey}`,
                        ...config.headers
                    };
                } else if (providerType === 'anthropic') {
                    config.headers = {
                        'x-api-key': currentKey,
                        'anthropic-version': config.headers?.['anthropic-version'] || '2023-06-01',
                        ...config.headers
                    };
                    // 如果请求是 OpenAI 格式，则转换为 Anthropic 格式
                    if (config.data && config.url.includes('/chat/completions')) {
                        config.data = this.convertToAnthropicFormat(config.data);
                        config.url = config.url.replace('/chat/completions', '/messages');
                    }
                } else if (providerType === 'google') {
                    // Google Gemini 可以通过 Header 或 Query 参数
                    config.headers = {
                        'x-goog-api-key': currentKey,
                        ...config.headers
                    };
                    // 如果请求是 OpenAI 格式，转换为 Gemini 格式
                    if (config.data && config.url.includes('/chat/completions')) {
                        config.data = this.convertToGeminiFormat(config.data);
                        const modelId = config.data.model || this.provider.id;
                        config.url = config.url.replace(/\/v1\/chat\/completions.*/, `/v1beta/models/${modelId}:generateContent`);
                    }
                } else {
                    // 默认使用 Bearer token
                    config.headers = {
                        'Authorization': `Bearer ${currentKey}`,
                        ...config.headers
                    };
                }

                logger.info(`使用API密钥 ${keyName} 发送请求到 ${this.provider.name}`);

                // 发送请求
                const response = await axios(config);

                // 记录成功统计
                const responseTime = Date.now() - startTime;
                
                // 记录令牌使用情况
                recordTokenUsage(
                    /** @type {any} */ (global).db,
                    Number(this.provider.id),
                    this.extractModelFromResponse(response),
                    currentKeyId,
                    response,
                    responseTime,
                    'success'
                );
                
                // 请求成功，增加计数
                this.requestCount++;
                return response;

            } catch (error) {
                lastError = error;
                attempts++;

                // 记录错误统计
                this.errorCounts[currentKeyId]++;
                
                // 记录令牌使用情况
                const axiosErr = /** @type {any} */ (error);
                recordTokenUsage(
                    /** @type {any} */ (global).db,
                    Number(this.provider.id),
                    this.extractModelFromResponse(axiosErr.response),
                    currentKeyId,
                    axiosErr.response,
                    Date.now() - startTime,
                    'error',
                    axiosErr.message || 'Unknown error'
                );

                // 如果是认证错误或速率限制，尝试下一个密钥
                if (axiosErr.response && (axiosErr.response.status === 401 || axiosErr.response.status === 403 || axiosErr.response.status === 429)) {
                    logger.info(`API密钥 ${keyName} 错误 (${axiosErr.response.status})，尝试下一个密钥`);
                    // 暂时拉黑当前密钥
                    this.blacklistKey(currentKeyId);
                    this.rotateKey('error');
                    continue;
                }

                // 其他错误直接抛出
                throw error;
            }
        }

        // 所有密钥都尝试失败
        throw lastError || new Error('所有API密钥都尝试失败');
    }

    // 获取密钥统计信息
    getKeyStats() {
        return this.apiKeys.map(key => {
            return {
                id: key.id,
                name: key.name,
                errorCount: this.errorCounts[key.id] || 0,
                isActive: this.currentKeyIndex === this.apiKeys.findIndex(k => k.id === key.id),
                isBlacklisted: this.blacklistedKeys.has(key.id)
            };
        });
    }

    // 检测OpenAI模型
    async detectOpenAIModels() {
        try {
            let baseUrl = this.provider.url.endsWith('/') ? this.provider.url.slice(0, -1) : this.provider.url;
            const endpoint = '/models';
            
            // 智能处理重复的路径段和版本号
            let currentEndpoint = endpoint;
            const versionMatch = baseUrl.match(/\/(v\d+)$/i);
            if (versionMatch && currentEndpoint.startsWith('/v1')) {
                const version = versionMatch[1];
                currentEndpoint = currentEndpoint.replace(/^\/v1/, `/${version}`);
            }

            let url = `${baseUrl}${currentEndpoint}`.replace(/([^:])\/\/+/g, '$1/');
            url = url.replace(/\/v\d+\/v\d+/gi, (match) => match.split('/')[1])
                     .replace(/\/api\/api+/g, '/api');

            const response = await this.makeRequest({
                method: 'get',
                url: url,
                timeout: 10000
            });

            if (response.data && response.data.data) {
                return response.data.data.map((/** @type {any} */ model) => ({
                    id: model.id,
                    name: model.id,
                    description: `OpenAI模型: ${model.id}`,
                    category: this.getModelCategory(model.id),
                    context: this.getContextWindow(model.id),
                    capabilities: this.getModelCapabilities(model.id)
                }));
            }

            return [];
        } catch (error) {
            logger.error(`检测OpenAI模型失败: ${/** @type {Error} */ (error).message}`);
            throw error;
        }
    }

    // 检测Anthropic模型
    async detectAnthropicModels() {
        // Anthropic的模型列表通常是固定的，API不提供动态列表
        return [
            {
                id: 'claude-3-opus-20240229',
                name: 'claude-3-opus-20240229',
                description: '最强大的Claude 3模型，适用于复杂任务',
                category: '聊天',
                context: '200K tokens',
                capabilities: ['文本分析', '代码生成', '推理', '创意写作']
            },
            {
                id: 'claude-3-sonnet-20240229',
                name: 'claude-3-sonnet-20240229',
                description: '平衡性能和速度的Claude 3模型',
                category: '聊天',
                context: '200K tokens',
                capabilities: ['文本分析', '代码生成', '推理', '创意写作']
            },
            {
                id: 'claude-3-haiku-20240307',
                name: 'claude-3-haiku-20240307',
                description: '快速响应的Claude 3模型，适用于简单任务',
                category: '聊天',
                context: '200K tokens',
                capabilities: ['文本分析', '代码生成', '推理', '创意写作']
            }
        ];
    }

    // 检测模型
    async detectModels() {
        if (this.provider.name.toLowerCase().includes('anthropic')) {
            return await this.detectAnthropicModels();
        } else {
            // 默认尝试OpenAI格式
            try {
                return await this.detectOpenAIModels();
            } catch (error) {
                logger.error(`检测模型失败: ${/** @type {Error} */ (error).message}`);
                throw error;
            }
        }
    }

    // 获取模型类别
    /**
     * @param {string} modelId
     */
    getModelCategory(modelId) {
        if (modelId.includes('gpt-4')) return '高级聊天';
        if (modelId.includes('gpt-3.5')) return '聊天';
        if (modelId.includes('dall-e')) return '图像生成';
        if (modelId.includes('whisper')) return '语音转文本';
        if (modelId.includes('tts')) return '文本转语音';
        if (modelId.includes('embedding')) return '嵌入';
        if (modelId.includes('fine-tune')) return '微调';
        return '其他';
    }

    // 获取上下文窗口大小
    /**
     * @param {string} modelId
     */
    getContextWindow(modelId) {
        if (modelId.includes('gpt-4-32k')) return '32K tokens';
        if (modelId.includes('gpt-4')) return '8K tokens';
        if (modelId.includes('gpt-3.5-turbo-16k')) return '16K tokens';
        if (modelId.includes('gpt-3.5-turbo')) return '4K tokens';
        return '未知';
    }

    // 获取模型能力
    /**
     * @param {string} modelId
     */
    getModelCapabilities(modelId) {
        const capabilities = [];

        if (modelId.includes('gpt')) {
            capabilities.push('文本生成', '对话', '推理');
        }

        if (modelId.includes('dall-e')) {
            capabilities.push('图像生成');
        }

        if (modelId.includes('whisper')) {
            capabilities.push('语音转文本');
        }

        if (modelId.includes('tts')) {
            capabilities.push('文本转语音');
        }

        if (modelId.includes('embedding')) {
            capabilities.push('文本嵌入');
        }

        return capabilities;
    }
    
    // 从响应中提取模型ID
    /**
     * @param {any} response
     */
    extractModelFromResponse(response) {
        if (!response || !response.data) return 'unknown';
        return response.data.model || response.data.id || 'unknown';
    }

    // 识别提供商类型
    identifyProviderType() {
        const name = this.provider.name.toLowerCase();
        const url = this.provider.url.toLowerCase();
        if (name.includes('openai') || url.includes('openai.com')) return 'openai';
        if (name.includes('anthropic') || name.includes('claude') || url.includes('anthropic.com')) return 'anthropic';
        if (name.includes('google') || name.includes('gemini') || url.includes('googleapis.com')) return 'google';
        return 'openai-compatible';
    }

    // 转换为 Anthropic 格式 (Messages API)
    /**
     * @param {any} openaiData
     */
    convertToAnthropicFormat(openaiData) {
        return {
            model: openaiData.model,
            messages: openaiData.messages.filter((/** @type {any} */ m) => m.role !== 'system'),
            system: openaiData.messages.find((/** @type {any} */ m) => m.role === 'system')?.content || '',
            max_tokens: openaiData.max_tokens || 4096,
            stream: openaiData.stream || false,
            temperature: openaiData.temperature || 1
        };
    }

    // 转换为 Gemini 格式
    /**
     * @param {any} openaiData
     */
    convertToGeminiFormat(openaiData) {
        const contents = openaiData.messages.map((/** @type {any} */ m) => {
            let parts = [];
            if (typeof m.content === 'string') {
                parts.push({ text: m.content });
            } else if (Array.isArray(m.content)) {
                // 处理多模态 (图片/视频)
                m.content.forEach((/** @type {any} */ part) => {
                    if (part.type === 'text') parts.push({ text: part.text });
                    if (part.type === 'image_url') {
                        const data = part.image_url.url.split(',')[1];
                        const mimeType = part.image_url.url.split(';')[0].split(':')[1];
                        parts.push({ inline_data: { mime_type: mimeType, data: data } });
                    }
                });
            }
            return {
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: parts
            };
        });

        return {
            contents: contents,
            generationConfig: {
                temperature: openaiData.temperature,
                topP: openaiData.top_p,
                maxOutputTokens: openaiData.max_tokens
            }
        };
    }
}

export default ModelAnalyzerEnhanced;
