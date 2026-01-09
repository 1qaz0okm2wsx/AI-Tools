
// @ts-nocheck
/**
 * 模型分析器 (ESM)
 */

import axios from 'axios';
import 'dotenv/config';

// 超时设置
/** @type {number} */
const API_TIMEOUT = parseInt(process.env.API_TIMEOUT || '10000', 10);

/**
 * @typedef {Object} Provider
 * @property {string} name
 * @property {string} url
 * @property {string} [api_key]
 */

/**
 * @typedef {Object} DetectedModel
 * @property {string} id
 * @property {string} name
 * @property {string} provider
 * @property {string} [description]
 * @property {string} [category]
 * @property {string} [context]
 * @property {string[]} [capabilities]
 */

/**
 * 模型分析器 - 用于检测各种AI服务提供商的可用模型
 */
class ModelAnalyzer {
    /**
     * 分析指定提供商的可用模型
     * @param {Provider} provider - 提供商信息对象
     * @returns {Promise<DetectedModel[]>} - 返回模型列表
     */
    async analyzeModels(provider) {
        try {
            // 根据提供商URL和名称确定提供商类型
            const providerType = this.identifyProviderType(provider);

            // 根据提供商类型调用相应的检测方法
            switch (providerType) {
                case 'openai':
                    return await this.detectOpenAIModels(provider);
                case 'anthropic':
                    return await this.detectAnthropicModels(provider);
                case 'google':
                    return await this.detectGoogleModels(provider);
                case 'azure':
                    return await this.detectAzureModels(provider);
                case 'huggingface':
                    return await this.detectHuggingFaceModels(provider);
                case 'cohere':
                    return await this.detectCohereModels(provider);
                case 'ollama':
                    return await this.detectOllamaModels(provider);
                case 'lmstudio':
                    return await this.detectLmStudioModels(provider);
                case 'openrouter':
                    return await this.detectOpenRouterModels(provider);
                case 'zhipu':
                    return await this.detectZhipuModels(provider);
                default:
                    return await this.detectGenericModels(provider);
            }
        } catch (error) {
            console.error(`分析${provider.name}的模型时出错:`, error.message);
            return [];
        }
    }

    /**
     * 根据提供商信息识别提供商类型
     * @param {Provider} provider - 提供商信息
     * @returns {string} - 提供商类型
     */
    identifyProviderType(/** @type {Provider} */ provider) {
        const { name, url } = provider;
        const lowerName = name.toLowerCase();
        const lowerUrl = url.toLowerCase();

        // 检查名称和URL以确定提供商类型
        if (lowerName.includes('openai') || lowerUrl.includes('openai.com')) {
            return 'openai';
        } else if (lowerName.includes('anthropic') || lowerUrl.includes('anthropic.com')) {
            return 'anthropic';
        } else if (lowerName.includes('google') || lowerUrl.includes('googleapis.com') || lowerUrl.includes('generativelanguage.googleapis.com')) {
            return 'google';
        } else if (lowerName.includes('azure') || lowerUrl.includes('azure.com')) {
            return 'azure';
        } else if (lowerName.includes('huggingface') || lowerUrl.includes('huggingface.co')) {
            return 'huggingface';
        } else if (lowerName.includes('cohere') || lowerUrl.includes('cohere.com')) {
            return 'cohere';
        } else if (lowerName.includes('ollama') || lowerUrl.includes('ollama.ai')) {
            return 'ollama';
        } else if (lowerName.includes('lmstudio') || lowerUrl.includes('lmstudio.ai')) {
            return 'lmstudio';
        } else if (lowerName.includes('openrouter') || lowerUrl.includes('openrouter.ai')) {
            return 'openrouter';
        } else if (lowerName.includes('zhipu') || lowerName.includes('智谱') || lowerUrl.includes('bigmodel.cn')) {
            return 'zhipu';
        }

        // 默认返回通用类型
        return 'generic';
    }

    /**
     * 检测OpenAI模型
     * @param {Provider} provider - 提供商信息
     * @returns {Promise<DetectedModel[]>} - 模型列表
     */
    async detectOpenAIModels(/** @type {Provider} */ provider) {
        try {
            // 验证API密钥格式
            if (!provider.api_key || (typeof provider.api_key !== 'string' || !provider.api_key.startsWith('sk-'))) {
                console.error('OpenAI API密钥格式无效，应以sk-开头');
                return this.getDefaultOpenAIModels();
            }

            console.log(`正在使用API密钥 ${provider.api_key.substring(0, 7)}... 检测OpenAI模型`);
            
            // 默认OpenAI API地址
            let baseUrl = 'https://api.openai.com';
            
            // 如果提供商URL不是默认的，则使用提供商URL
            if (provider.url && !provider.url.includes('api.openai.com')) {
                baseUrl = provider.url.endsWith('/') ? provider.url.slice(0, -1) : provider.url;
                
                // 智能处理重复的路径段和版本号
                const versionMatch = baseUrl.match(/\/(v\d+)$/i);
                if (versionMatch) {
                    baseUrl = baseUrl.slice(0, -versionMatch[0].length);
                } else if (baseUrl.endsWith('/api')) {
                    baseUrl = baseUrl.slice(0, -4);
                }
            }
            
            const response = await axios.get(`${baseUrl}/v1/models`, {
                headers: {
                    'Authorization': `Bearer ${provider.api_key}`
                },
                timeout: API_TIMEOUT
            });

            // 过滤掉一些不常用的模型，只保留主要的聊天和完成模型
            const filteredModels = response.data.data.filter(model => {
                return model.id.includes('gpt') || model.id.includes('dall-e') || model.id.includes('whisper');
            });

            console.log(`成功获取 ${filteredModels.length} 个OpenAI模型`);
            return filteredModels.map(model => ({
                id: model.id,
                name: model.id,
                provider: 'OpenAI'
            }));
        } catch (error) {
            if (error.response) {
                const status = error.response.status;
                if (status === 401) {
                    console.error('OpenAI API认证失败: API密钥无效或已过期');
                } else if (status === 403) {
                    console.error('OpenAI API访问被拒绝: API密钥可能没有访问模型列表的权限');
                } else if (status === 404) {
                    console.error('OpenAI API端点不存在: 可能API已更新，请检查最新文档');
                } else if (status === 429) {
                    console.error('OpenAI API请求频率限制: 请稍后再试');
                } else {
                    console.error(`OpenAI API错误 (${status}): ${error.response.data?.error?.message || error.message}`);
                }
            } else {
                console.error('OpenAI模型检测失败:', error.message);
            }
            
            // 返回默认的OpenAI模型列表，确保系统仍能工作
            console.log('使用默认OpenAI模型列表作为备用');
            return this.getDefaultOpenAIModels();
        }
    }

    /**
     * 检测Anthropic模型
     * @param {Provider} provider - 提供商信息
     * @returns {Promise<DetectedModel[]>} - 模型列表
     */
    async detectAnthropicModels(/** @type {Provider} */ provider) {
        // Anthropic的模型列表通常是固定的，API不提供动态列表
        return [
            { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'Anthropic' },
            { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', provider: 'Anthropic' },
            { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', provider: 'Anthropic' },
            { id: 'claude-2.1', name: 'Claude 2.1', provider: 'Anthropic' },
            { id: 'claude-2.0', name: 'Claude 2.0', provider: 'Anthropic' },
            { id: 'claude-instant-1.2', name: 'Claude Instant', provider: 'Anthropic' }
        ];
    }

    /**
     * 检测Google模型
     * @param {Provider} provider - 提供商信息
     * @returns {Promise<DetectedModel[]>} - 模型列表
     */
    async detectGoogleModels(/** @type {Provider} */ provider) {
        // Google的模型列表通常是固定的
        return [
            { id: 'gemini-pro', name: 'Gemini Pro', provider: 'Google' },
            { id: 'gemini-pro-vision', name: 'Gemini Pro Vision', provider: 'Google' },
            { id: 'text-bison-001', name: 'PaLM 2 Text Bison', provider: 'Google' },
            { id: 'chat-bison-001', name: 'PaLM 2 Chat Bison', provider: 'Google' },
            { id: 'codechat-bison-001', name: 'PaLM 2 Code Chat Bison', provider: 'Google' }
        ];
    }

    /**
     * 检测Azure OpenAI模型
     * @param {Provider} provider - 提供商信息
     * @returns {Promise<DetectedModel[]>} - 模型列表
     */
    async detectAzureModels(/** @type {Provider} */ provider) {
        // Azure OpenAI的模型通常需要手动配置，这里提供一些常见的模型
        return [
            { id: 'gpt-35-turbo', name: 'GPT-3.5 Turbo', provider: 'Azure OpenAI' },
            { id: 'gpt-4', name: 'GPT-4', provider: 'Azure OpenAI' },
            { id: 'gpt-4-32k', name: 'GPT-4 32K', provider: 'Azure OpenAI' },
            { id: 'text-embedding-ada-002', name: 'Text Embedding Ada', provider: 'Azure OpenAI' }
        ];
    }

    /**
     * 检测Hugging Face模型
     * @param {Object} provider - 提供商信息
     * @returns {Promise<Array>} - 模型列表
     */
    async detectHuggingFaceModels(provider) {
        try {
            // Hugging Face API获取模型列表
            const response = await axios.get('https://huggingface.co/api/models', {
                headers: {
                    'Authorization': `Bearer ${provider.api_key}`
                },
                timeout: API_TIMEOUT,
                params: {
                    limit: 20, // 只获取前20个模型
                    sort: 'downloads',
                    direction: '-1'
                }
            });

            return response.data.map(model => ({
                id: model.id,
                name: `${model.id} (${model.pipeline || 'N/A'})`,
                provider: 'Hugging Face'
            }));
        } catch (/** @type {any} */ error) {
            console.error('Hugging Face模型检测失败:', error.message);
            // 如果API调用失败，返回一些常见的模型
            return [
                { id: 'gpt2', name: 'GPT-2', provider: 'Hugging Face' },
                { id: 'distilbert-base-uncased', name: 'DistilBERT Base', provider: 'Hugging Face' },
                { id: 'bert-base-uncased', name: 'BERT Base', provider: 'Hugging Face' },
                { id: 't5-base', name: 'T5 Base', provider: 'Hugging Face' }
            ];
        }
    }

    /**
     * 检测Cohere模型
     * @param {Object} provider - 提供商信息
     * @returns {Promise<Array>} - 模型列表
     */
    async detectCohereModels(provider) {
        try {
            const response = await axios.get('https://api.cohere.ai/v1/models', {
                headers: {
                    'Authorization': `Bearer ${provider.api_key}`
                },
                timeout: API_TIMEOUT
            });

            return response.data.models.map(model => ({
                id: model.name,
                name: model.name,
                provider: 'Cohere'
            }));
        } catch (error) {
            console.error('Cohere模型检测失败:', error.message);
            // 如果API调用失败，返回已知的Cohere模型
            return [
                { id: 'command', name: 'Command', provider: 'Cohere' },
                { id: 'command-nightly', name: 'Command Nightly', provider: 'Cohere' },
                { id: 'command-light', name: 'Command Light', provider: 'Cohere' },
                { id: 'embed-english-v2.0', name: 'Embed English v2.0', provider: 'Cohere' },
                { id: 'embed-multilingual-v2.0', name: 'Embed Multilingual v2.0', provider: 'Cohere' }
            ];
        }
    }

    /**
     * 检测Ollama模型
     * @param {Object} provider - 提供商信息
     * @returns {Promise<Array>} - 模型列表
     */
    async detectOllamaModels(provider) {
        try {
            // 尝试从提供商URL获取Ollama模型列表
            const response = await axios.get(`${provider.url}/api/tags`, {
                timeout: API_TIMEOUT
            });

            return response.data.models.map(model => ({
                id: model.name,
                name: `${model.name} (${model.size})`,
                provider: 'Ollama'
            }));
        } catch (error) {
            console.error('Ollama模型检测失败:', error.message);
            // 如果API调用失败，返回一些常见的Ollama模型
            return [
                { id: 'llama2', name: 'Llama 2', provider: 'Ollama' },
                { id: 'codellama', name: 'Code Llama', provider: 'Ollama' },
                { id: 'mistral', name: 'Mistral', provider: 'Ollama' },
                { id: 'vicuna', name: 'Vicuna', provider: 'Ollama' }
            ];
        }
    }

    /**
     * 检测LM Studio模型
     * @param {Object} provider - 提供商信息
     * @returns {Promise<Array>} - 模型列表
     */
    async detectLmStudioModels(provider) {
        try {
            // 尝试从提供商URL获取LM Studio模型列表
            const response = await axios.get(`${provider.url}/v1/models`, {
                timeout: API_TIMEOUT
            });

            return response.data.data.map(model => ({
                id: model.id,
                name: model.id,
                provider: 'LM Studio'
            }));
        } catch (error) {
            console.error('LM Studio模型检测失败:', error.message);
            // 如果API调用失败，返回一些常见的LM Studio模型
            return [
                { id: 'local-model', name: 'Local Model', provider: 'LM Studio' }
            ];
        }
    }

    /**
     * 检测OpenRouter模型
     * @param {Object} provider - 提供商信息
     * @returns {Promise<Array>} - 模型列表
     */
    async detectOpenRouterModels(provider) {
        try {
            const response = await axios.get('https://openrouter.ai/api/v1/models', {
                headers: {
                    'Authorization': `Bearer ${provider.api_key}`
                },
                timeout: API_TIMEOUT
            });

            return response.data.data.map(model => ({
                id: model.id,
                name: `${model.name} (${model.pricing?.prompt ? '$' + model.pricing.prompt + '/1K tokens' : 'N/A'})`,
                provider: 'OpenRouter'
            }));
        } catch (error) {
            console.error('OpenRouter模型检测失败:', error.message);
            // 如果API调用失败，返回一些常见的OpenRouter模型
            return [
                { id: 'openai/gpt-3.5-turbo', name: 'OpenAI GPT-3.5 Turbo', provider: 'OpenRouter' },
                { id: 'openai/gpt-4', name: 'OpenAI GPT-4', provider: 'OpenRouter' },
                { id: 'anthropic/claude-3-opus', name: 'Anthropic Claude 3 Opus', provider: 'OpenRouter' },
                { id: 'google/gemini-pro', name: 'Google Gemini Pro', provider: 'OpenRouter' }
            ];
        }
    }

    /**
     * 通用模型检测方法 - 能够自动检测任何AI服务网站的可用模型
     * @param {Object} provider - 提供商信息
     * @returns {Promise<Array>} - 模型列表
     */
    async detectGenericModels(provider) {
        const results = [];

        // 常见的API路径模式
        const apiPaths = [
            '/v1/models',
            '/models',
            '/api/models',
            '/api/v1/models',
            '/model/list',
            '/api/model/list',
            '/llm/models',
            '/chat/models'
        ];

        // 常见的认证方式
        const authMethods = [
            { headers: { 'Authorization': `Bearer ${provider.api_key}` } },
            { headers: { 'X-Api-Key': provider.api_key } },
            { headers: { 'OpenAI-Api-Key': provider.api_key } },
            { headers: { 'api-key': provider.api_key } }
        ];

        // 尝试每个路径和认证方式组合
        for (const path of apiPaths) {
            for (const auth of authMethods) {
                try {
                    // 确保URL格式正确（避免双斜杠）
                    let baseUrl = provider.url.endsWith('/') ? provider.url.slice(0, -1) : provider.url;
                    
                    // 智能处理重复的路径段和版本号
                    let currentPath = path;
                    if (baseUrl.match(/\/v\d+$/i) && currentPath.startsWith('/v1')) {
                        const version = baseUrl.match(/\/(v\d+)$/i)[1];
                        currentPath = currentPath.replace(/^\/v1/, `/${version}`);
                    }

                    let fullUrl = `${baseUrl}${currentPath}`.replace(/([^:])\/\/+/g, '$1/');
                    fullUrl = fullUrl.replace(/\/v\d+\/v\d+/gi, (match) => match.split('/')[1])
                                     .replace(/\/api\/api+/g, '/api');
                    
                    console.log(`尝试路径: ${fullUrl} 使用认证方式: ${Object.keys(auth.headers)[0]}`);

                    // 尝试获取模型列表
                    const response = await axios.get(fullUrl, {
                        headers: {
                            'Content-Type': 'application/json',
                            ...auth.headers
                        },
                        timeout: API_TIMEOUT
                    });

                    // 解析响应数据，尝试提取模型信息
                    const models = this.parseModelsResponse(response.data, provider);
                    if (models.length > 0) {
                        results.push(...models);
                        console.log(`从路径 ${path} 使用认证 ${Object.keys(auth.headers)[0]} 成功获取 ${models.length} 个模型`);
                        return results; // 找到模型后直接返回
                    }
                } catch (error) {
                    console.log(`路径 ${path} 使用认证 ${Object.keys(auth.headers)[0]} 失败: ${error.message}`);
                    if (error.response) {
                        console.log(`响应状态: ${error.response.status}, 响应数据:`, error.response.data);
                    }
                    // 继续尝试下一个组合
                }
            }
        }

        // 如果没有找到任何模型，尝试通过API文档页面分析
        if (results.length === 0) {
            try {
                const docModels = await this.analyzeApiDocumentation(provider);
                if (docModels.length > 0) {
                    results.push(...docModels);
                }
            } catch (error) {
                console.log(`分析API文档失败: ${error.message}`);
            }
        }

        // 如果仍然没有找到模型，返回一个默认模型
        if (results.length === 0) {
            results.push({
                id: 'default-model',
                name: 'Default Model (无法自动检测)',
                provider: provider.name
            });
        }

        return results;
    }

    /**
     * 解析模型响应数据，尝试提取模型信息
     * @param {Object} data - API响应数据
     * @param {Object} provider - 提供商信息
     * @returns {Array} - 解析出的模型列表
     */
    parseModelsResponse(data, provider) {
        const models = [];

        // 尝试不同的响应格式
        // 1. OpenAI格式: { data: [{ id: "...", ... }] }
        if (data && data.data && Array.isArray(data.data)) {
            for (const model of data.data) {
                if (model.id) {
                    models.push({
                        id: model.id,
                        name: model.name || model.id,
                        provider: provider.name
                    });
                }
            }
        }

        // 2. 直接数组格式: [{ id: "...", ... }, ...]
        else if (Array.isArray(data)) {
            for (const model of data) {
                if (model.id || model.name) {
                    models.push({
                        id: model.id || model.name,
                        name: model.name || model.id,
                        provider: provider.name
                    });
                }
            }
        }

        // 3. 嵌套格式: { models: [{ id: "...", ... }] }
        else if (data && data.models && Array.isArray(data.models)) {
            for (const model of data.models) {
                if (model.id || model.name) {
                    models.push({
                        id: model.id || model.name,
                        name: model.name || model.id,
                        provider: provider.name
                    });
                }
            }
        }

        // 4. 其他可能的格式
        else if (data) {
            // 尝试查找任何包含模型信息的属性
            for (const key in data) {
                if (Array.isArray(data[key])) {
                    for (const item of data[key]) {
                        if (item.id || item.name || item.model) {
                            models.push({
                                id: item.id || item.name || item.model,
                                name: item.name || item.id || item.model,
                                provider: provider.name
                            });
                        }
                    }
                }
            }
        }

        return models;
    }

    /**
     * 分析API文档页面，尝试提取模型信息
     * @param {Object} provider - 提供商信息
     * @returns {Promise<Array>} - 提取出的模型列表
     */
    async analyzeApiDocumentation(provider) {
        const models = [];

        // 常见的文档路径
        const docPaths = [
            '/docs',
            '/documentation',
            '/api-docs',
            '/swagger',
            '/openapi.json',
            '/api/docs',
            '/api/documentation'
        ];

        for (const path of docPaths) {
            try {
                // 尝试获取API文档
                const response = await axios.get(`${provider.url}${path}`, {
                    timeout: API_TIMEOUT
                });

                // 如果是OpenAPI/Swagger JSON
                if (path.endsWith('.json') || response.headers['content-type']?.includes('application/json')) {
                    const docModels = this.extractModelsFromOpenApi(response.data, provider);
                    if (docModels.length > 0) {
                        models.push(...docModels);
                        break;
                    }
                }
                // 如果是HTML文档，尝试解析HTML内容
                else if (typeof response.data === 'string') {
                    const htmlModels = this.extractModelsFromHtml(response.data, provider);
                    if (htmlModels.length > 0) {
                        models.push(...htmlModels);
                        break;
                    }
                }
            } catch (error) {
                console.log(`文档路径 ${path} 失败: ${error.message}`);
            }
        }

        return models;
    }

    /**
     * 从OpenAPI/Swagger文档中提取模型信息
     * @param {Object} doc - OpenAPI/Swagger文档
     * @param {Object} provider - 提供商信息
     * @returns {Array} - 提取出的模型列表
     */
    extractModelsFromOpenApi(doc, provider) {
        const models = [];

        // 查找可能的模型相关路径
        if (doc.paths) {
            for (const path in doc.paths) {
                // 查找包含"model"关键词的路径
                if (path.toLowerCase().includes('model')) {
                    // 从路径参数中提取可能的模型名称
                    const pathParams = path.match(/\{([^}]+)\}/g);
                    if (pathParams) {
                        for (const param of pathParams) {
                            const paramName = param.replace(/[{}]/g, '');
                            if (paramName.toLowerCase().includes('model')) {
                                // 这是一个模型参数，但我们需要更多信息来确定具体的模型
                                // 这里只添加一个占位符
                                models.push({
                                    id: `model-from-api-${models.length}`,
                                    name: `Model from API Path: ${path}`,
                                    provider: provider.name
                                });
                            }
                        }
                    }
                }
            }
        }

        // 查找可能的模型定义
        if (doc.components && doc.components.schemas) {
            for (const schemaName in doc.components.schemas) {
                if (schemaName.toLowerCase().includes('model')) {
                    models.push({
                        id: `model-schema-${schemaName}`,
                        name: `Model Schema: ${schemaName}`,
                        provider: provider.name
                    });
                }
            }
        }

        return models;
    }

    /**
     * 从HTML文档中提取模型信息
     * @param {string} html - HTML文档内容
     * @param {Object} provider - 提供商信息
     * @returns {Array} - 提取出的模型列表
     */
    extractModelsFromHtml(html, provider) {
        const models = [];

        // 使用正则表达式查找可能的模型名称
        // 这是一个简单的实现，实际应用中可能需要更复杂的HTML解析
        const modelPatterns = [
            /model[:\s]+([a-zA-Z0-9\-_\.]+)/gi,
            /gpt[-\s]*([0-9\.]+[a-z]*)/gi,
            /claude[-\s]*([0-9\.]+[a-z]*)/gi,
            /gemini[-\s]*([a-z0-9\-_\.]+)/gi,
            /llama[-\s]*([0-9\.]+[a-z]*)/gi
        ];

        for (const pattern of modelPatterns) {
            let match;
            while ((match = pattern.exec(html)) !== null) {
                const modelName = match[1];
                if (modelName && !models.some(m => m.name === modelName)) {
                    models.push({
                        id: modelName,
                        name: modelName,
                        provider: provider.name
                    });
                }
            }
        }

        return models;
    }

    /**
     * 获取默认的OpenAI模型列表
     * @returns {Array} - 默认模型列表
     */
    getDefaultOpenAIModels() {
        return [
            { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
            { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'OpenAI' },
            { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI' },
            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'OpenAI' },
            { id: 'gpt-3.5-turbo-16k', name: 'GPT-3.5 Turbo 16K', provider: 'OpenAI' },
            { id: 'dall-e-3', name: 'DALL-E 3', provider: 'OpenAI' },
            { id: 'dall-e-2', name: 'DALL-E 2', provider: 'OpenAI' },
            { id: 'whisper-1', name: 'Whisper 1', provider: 'OpenAI' },
            { id: 'text-embedding-ada-002', name: 'Text Embedding Ada', provider: 'OpenAI' }
        ];
    }

    /**
     * 检测智谱AI模型
     * @param {Object} provider - 提供商信息
     * @returns {Promise<Array>} - 模型列表
     */
    async detectZhipuModels(provider) {
        try {
            // 智谱AI的API密钥通常以特定格式开头
            if (!provider.api_key) {
                console.error('智谱AI API密钥未提供');
                return this.getDefaultZhipuModels();
            }

            console.log(`正在使用API密钥 ${provider.api_key.substring(0, 7)}... 检测智谱AI模型`);

            // 处理URL，确保不重复添加路径
            let baseUrl = provider.url.endsWith('/') ? provider.url.slice(0, -1) : provider.url;
            
            // 智谱AI的模型API路径
            let modelsUrl;
            if (baseUrl.toLowerCase().includes('/api/paas/v4')) {
                // 如果URL已经包含了/api/paas/v4，直接添加/models
                modelsUrl = `${baseUrl}/models`;
            } else if (baseUrl.toLowerCase().endsWith('/v4')) {
                // 如果URL以/v4结尾，添加/models
                modelsUrl = `${baseUrl}/models`;
            } else {
                // 否则添加完整的路径
                modelsUrl = `${baseUrl}/api/paas/v4/models`;
            }

            // 确保没有重复的斜杠
            modelsUrl = modelsUrl.replace(/([^:])\/\/+/g, '$1/');

            console.log(`尝试获取智谱AI模型: ${modelsUrl}`);

            // 发送请求
            const response = await axios.get(modelsUrl, {
                headers: {
                    'Authorization': `Bearer ${provider.api_key.trim()}`,
                    'Content-Type': 'application/json'
                },
                timeout: API_TIMEOUT
            });

            // 解析响应数据
            if (response.data && response.data.data && Array.isArray(response.data.data)) {
                const models = response.data.data.map(model => ({
                    id: model.id,
                    name: model.id, // 智谱AI通常使用相同的ID和名称
                    provider: '智谱AI',
                    description: model.object || '模型',
                    created: model.created || null
                }));

                console.log(`✅ 成功获取 ${models.length} 个智谱AI模型`);
                return models;
            } else {
                console.log('⚠️ 智谱AI API响应格式不符合预期，使用默认模型列表');
                return this.getDefaultZhipuModels();
            }
        } catch (error) {
            console.error(`获取智谱AI模型失败:`, error.message);
            if (error.response) {
                console.error(`响应状态: ${error.response.status}, 响应数据:`, error.response.data);
            }
            return this.getDefaultZhipuModels();
        }
    }

    /**
     * 获取默认的智谱AI模型列表
     * @returns {Array} - 默认模型列表
     */
    getDefaultZhipuModels() {
        return [
            { id: 'glm-4', name: 'GLM-4', provider: '智谱AI', description: '智谱AI最新一代大模型' },
            { id: 'glm-4v', name: 'GLM-4V', provider: '智谱AI', description: '支持图像理解的GLM-4模型' },
            { id: 'glm-3-turbo', name: 'GLM-3-Turbo', provider: '智谱AI', description: '高性能对话模型' },
            { id: 'glm-4-0520', name: 'GLM-4-0520', provider: '智谱AI', description: 'GLM-4特定版本' },
            { id: 'glm-4-air', name: 'GLM-4-Air', provider: '智谱AI', description: '轻量版GLM-4模型' },
            { id: 'glm-4-airx', name: 'GLM-4-AirX', provider: '智谱AI', description: '增强版轻量GLM-4模型' },
            { id: 'glm-4-flash', name: 'GLM-4-Flash', provider: '智谱AI', description: '极速版GLM-4模型' },
            { id: 'cogview-3', name: 'CogView-3', provider: '智谱AI', description: '智谱AI文生图模型' },
            { id: 'embedding-2', name: 'Embedding-2', provider: '智谱AI', description: '智谱AI文本嵌入模型' }
        ];
    }
}

export default ModelAnalyzer;
