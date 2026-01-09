/**
 * 统一API网关路由
 * 将OpenAI兼容API、浏览器自动化API、OAuth API统一为单一入口
 * 支持本地应用统一调用
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../src/utils/logger.js';
import { logOperation } from '../db_init.js';
import { browserService } from '../src/services/browser/index.js';
import { webConfigService } from '../src/services/webConfig.js';
import { cookieManager } from '../src/services/cookieManager.js';
import { oauthManager } from '../src/services/oauthManager.js';
import { encryptionService } from '../src/utils/encryption.js';
import axios from 'axios';

const router = express.Router();

/**
 * 统一API端点配置
 * 客户端可以通过 model 参数选择使用哪种服务
 */
const SERVICE_TYPES = {
  OPENAI_API: 'openai',      // 使用OpenAI兼容API
  BROWSER: 'browser',        // 使用浏览器自动化
  OAUTH: 'oauth',            // 使用OAuth认证的API
  AUTO: 'auto'               // 自动判断（默认）
};

/**
 * 错误类型定义
 */
const ERROR_TYPES = {
  NO_PROVIDER: 'no_provider_error',
  NO_BROWSER_CONFIG: 'no_browser_config_error',
  NO_OAUTH_TOKEN: 'no_oauth_token_error',
  BROWSER_UNAVAILABLE: 'browser_unavailable',
  OAUTH_EXPIRED: 'oauth_token_expired',
  API_ERROR: 'api_error',
  BROWSER_ERROR: 'browser_error',
  GATEWAY_ERROR: 'gateway_error',
  INVALID_REQUEST: 'invalid_request_error'
};

/**
 * 请求验证和解析
 */
function parseRequest(req) {
  const { model, messages, stream = true, service_type, browser_site, oauth_provider, temperature, max_tokens } = req.body;

  // 解析模型参数，格式: provider:model 或 service:model
  const modelParts = (model || 'auto').split(':');
  const serviceType = service_type || modelParts[0] || SERVICE_TYPES.AUTO;
  const modelName = modelParts[1] || model;

  return {
    model: modelName,
    serviceType: Object.values(SERVICE_TYPES).includes(serviceType) ? serviceType : SERVICE_TYPES.AUTO,
    messages,
    stream,
    browserSite: browser_site,
    oauthProvider: oauth_provider,
    temperature: temperature || 0.7,
    maxTokens: max_tokens
  };
}

/**
 * 使用OpenAI兼容API处理请求
 */
async function handleOpenAIRequest(req, res, parsed) {
  try {
    const db = req.app?.locals?.db || globalThis?.db;

    // 获取模型对应的提供商和API信息
    const provider = await new Promise((resolve, reject) => {
      let query = `SELECT p.* FROM providers p JOIN models m ON p.id = m.provider_id WHERE m.model_id = ? LIMIT 1`;
      let params = [parsed.model];

      db.get(query, params, (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (!provider) {
      // 尝试使用第一个可用的提供商
      const fallbackProvider = await new Promise((resolve, reject) => {
        db.get(`SELECT * FROM providers LIMIT 1`, (err, row) => {
          if (err) return reject(err);
          resolve(row);
        });
      });

      if (!fallbackProvider) {
        return res.status(400).json({
          error: {
            message: '没有配置的AI服务提供商',
            type: ERROR_TYPES.NO_PROVIDER
          }
        });
      }

      logger.warn(`模型 ${parsed.model} 未找到，使用默认提供商: ${fallbackProvider.name}`);
    }

    // 检查是否需要使用OAuth
    const providerName = parsed.oauthProvider || provider.name;
    let accessToken = null;

    if (oauthManager.hasValidTokens(providerName)) {
      try {
        accessToken = await oauthManager.getValidAccessToken(providerName);
        logger.info(`[GATEWAY] 使用OAuth Token: ${providerName}`);
      } catch (error) {
        logger.warn(`[GATEWAY] 获取OAuth Token失败: ${error.message}`);
      }
    }

    // 解密API密钥或使用OAuth Token
    let apiKey = accessToken;
    if (!apiKey) {
      try {
        const encrypted = JSON.parse(provider.api_key);
        apiKey = encryptionService.decrypt(encrypted);
      } catch {
        apiKey = provider.api_key;
      }
    }

    // 构建请求URL
    let apiUrl = provider.url.endsWith('/') ? provider.url.slice(0, -1) : provider.url;
    if (!apiUrl.match(/\/v\d+$/i)) {
      apiUrl += '/v1';
    }
    apiUrl += '/chat/completions';

    // 构建请求头
    const headers = {
      'Content-Type': 'application/json'
    };

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // 构建请求体
    const requestBody = {
      model: provider.models?.find(m => m.model_id === parsed.model)?.model_name || parsed.model,
      messages: parsed.messages,
      stream: parsed.stream,
      temperature: parsed.temperature
    };
    if (parsed.maxTokens) {
      requestBody.max_tokens = parsed.maxTokens;
    }

    logger.info(`[GATEWAY] 使用OpenAI API: ${apiUrl}, 模型: ${parsed.model}, OAuth: ${!!accessToken}`);

    // 发送请求
    if (parsed.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const response = await axios({
        method: 'POST',
        url: apiUrl,
        headers,
        data: requestBody,
        responseType: 'stream'
      });

      response.data.on('data', (chunk) => {
        res.write(chunk);
      });

      response.data.on('end', () => {
        res.end();
      });

      response.data.on('error', (err) => {
        logger.error('[GATEWAY] Stream error:', err);
        res.end();
      });
    } else {
      const response = await axios({
        method: 'POST',
        url: apiUrl,
        headers,
        data: requestBody
      });

      return res.json(response.data);
    }

    // 记录日志
    logOperation(db, 'API_GATEWAY_REQUEST', 'service', provider.id, provider.name,
                `统一API调用: ${parsed.serviceType}, 模型: ${parsed.model}`, 'success', req);

  } catch (error) {
    logger.error('[GATEWAY] OpenAI request error:', error);
    return res.status(500).json({
      error: {
        message: error.message || 'OpenAI API请求失败',
        type: ERROR_TYPES.API_ERROR
      }
    });
  }
}

/**
 * 使用浏览器自动化处理请求
 */
async function handleBrowserRequest(req, res, parsed) {
  try {
    const db = req.app?.locals?.db || globalThis?.db;

    // 确定目标站点
    const site = parsed.browserSite || 'default';
    const siteConfig = webConfigService.getSiteConfig(site);

    if (!siteConfig) {
      return res.status(400).json({
        error: {
          message: `未找到站点配置: ${site}`,
          type: 'site_not_found',
          available_sites: Object.keys(webConfigService.getAllSites())
        }
      });
    }

    logger.info(`[GATEWAY] 使用浏览器自动化: ${site}`);

    // 检查浏览器连接
    const health = await browserService.healthCheck();
    if (!health.connected) {
      // 尝试初始化
      try {
        await browserService.initialize();
      } catch (initError) {
        logger.warn('[GATEWAY] 浏览器初始化失败:', initError.message);
        return res.status(503).json({
          error: {
            message: '浏览器服务未可用，请先启动Chrome远程调试模式',
            type: 'browser_unavailable'
          }
        });
      }
    }

    // 获取页面并加载cookies
    const page = browserService.getPage();
    const cookies = await cookieManager.loadCookies(site);

    if (cookies && cookies.length > 0) {
      await page.setCookie(...cookies);
      logger.info(`[GATEWAY] 已加载 ${cookies.length} 个cookies for ${site}`);
    }

    // 打开目标URL
    const targetUrl = siteConfig.url || `https://${site}`;
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // 记录日志
    logOperation(db, 'API_GATEWAY_REQUEST', 'browser', 0, site,
                `统一API调用: browser, 站点: ${site}`, 'success', req);

    // 执行聊天请求
    if (parsed.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        for await (const chunk of browserService.executeWorkflow(parsed.messages, true)) {
          res.write(chunk);
        }
        res.end();
      } catch (error) {
        logger.error('[GATEWAY] Browser stream error:', error);
        res.write(`data: ${JSON.stringify({ error: { message: error.message } })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
    } else {
      let collectedContent = [];
      for await (const chunk of browserService.executeWorkflow(parsed.messages, false)) {
        if (chunk.startsWith('data: ')) {
          try {
            const dataStr = chunk.slice(6).trim();
            if (dataStr && dataStr !== '[DONE]') {
              const data = JSON.parse(dataStr);
              if (data.choices && data.choices[0] && data.choices[0].delta) {
                const content = data.choices[0].delta.content || '';
                collectedContent.push(content);
              }
            }
          } catch {
            // 忽略解析错误
          }
        }
      }

      return res.json({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: parsed.model || `web-${site}`,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: collectedContent.join('')
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      });
    }

  } catch (error) {
    logger.error('[GATEWAY] Browser request error:', error);
    return res.status(500).json({
      error: {
        message: error.message || '浏览器自动化请求失败',
        type: 'browser_error'
      }
    });
  }
}

/**
 * 自动判断使用哪种服务
 */
async function handleAutoRequest(req, res, parsed) {
  try {
    const db = req.app?.locals?.db || globalThis?.db;

    // 检查是否有浏览器站点配置
    const sites = webConfigService.getAllSites();
    const hasBrowserConfig = Object.keys(sites).length > 0;

    // 检查是否有AI提供商
    const hasProvider = await new Promise((resolve) => {
      db.get(`SELECT COUNT(*) as count FROM providers`, (err, row) => {
        resolve(row?.count > 0);
      });
    });

    // 检查是否有OAuth Token
    const hasOAuthToken = oauthManager.hasValidTokens(parsed.oauthProvider || parsed.model);

    // 根据优先级选择服务
    if (hasOAuthToken) {
      logger.info('[GATEWAY] 自动选择: OpenAI API with OAuth');
      return handleOpenAIRequest(req, res, parsed);
    } else if (hasProvider && !hasBrowserConfig) {
      logger.info('[GATEWAY] 自动选择: OpenAI API');
      return handleOpenAIRequest(req, res, parsed);
    } else if (hasBrowserConfig && !hasProvider) {
      logger.info('[GATEWAY] 自动选择: 浏览器自动化');
      return handleBrowserRequest(req, res, parsed);
    } else if (hasProvider && hasBrowserConfig) {
      // 优先使用OpenAI API
      logger.info('[GATEWAY] 自动选择: OpenAI API (有多个选项，使用优先级)');
      return handleOpenAIRequest(req, res, parsed);
    } else {
      return res.status(500).json({
        error: {
          message: '未配置任何AI服务、浏览器站点或OAuth Token',
          type: ERROR_TYPES.INVALID_REQUEST
        }
      });
    }
  } catch (error) {
    logger.error('[GATEWAY] Auto request error:', error);
    return res.status(500).json({
      error: {
        message: error.message || '自动路由请求失败',
        type: ERROR_TYPES.GATEWAY_ERROR
      }
    });
  }
}

/**
 * 主路由 - 统一聊天完成接口
 * POST /v1/ai/chat/completions
 */
router.post('/v1/ai/chat/completions', async (req, res) => {
  try {
    const parsed = parseRequest(req);

    // 验证请求
    if (!parsed.messages || !Array.isArray(parsed.messages) || parsed.messages.length === 0) {
      return res.status(400).json({
        error: {
          message: 'messages 参数不能为空',
          type: ERROR_TYPES.INVALID_REQUEST
        }
      });
    }

    logger.info(`[GATEWAY] 收到请求 - 服务类型: ${parsed.serviceType}, 模型: ${parsed.model}`);

    // 根据服务类型路由请求
    switch (parsed.serviceType) {
      case SERVICE_TYPES.OPENAI_API:
      case SERVICE_TYPES.OAUTH:
        await handleOpenAIRequest(req, res, parsed);
        break;
      case SERVICE_TYPES.BROWSER:
        await handleBrowserRequest(req, res, parsed);
        break;
      case SERVICE_TYPES.AUTO:
      default:
        await handleAutoRequest(req, res, parsed);
        break;
    }
  } catch (error) {
    logger.error('[GATEWAY] Request error:', error);
    return res.status(500).json({
      error: {
        message: error.message || '统一API请求失败',
        type: ERROR_TYPES.GATEWAY_ERROR
      }
    });
  }
});

/**
 * 获取可用模型列表
 * GET /v1/ai/models
 */
router.get('/v1/ai/models', async (req, res) => {
  try {
    const db = req.app?.locals?.db || globalThis?.db;

    // 获取OpenAI API模型
    const apiModels = await new Promise((resolve) => {
      db.all(`
        SELECT DISTINCT m.model_id, m.model_name, p.name as provider_name
        FROM models m
        JOIN providers p ON m.provider_id = p.id
        ORDER BY m.model_name
      `, (err, rows) => {
        if (err) {
          logger.error('获取API模型失败:', err);
          resolve([]);
        } else {
          resolve(rows);
        }
      });
    });

    // 获取浏览器站点
    const sites = webConfigService.getAllSites();
    const browserModels = Object.keys(sites)
      .filter(domain => domain !== '_global')
      .map(domain => ({
        model_id: `web-${domain}`,
        model_name: `浏览器自动化 - ${domain}`,
        provider_name: 'Web Browser',
        type: 'browser',
        site: domain
      }));

    // 获取OAuth Token提供商
    const oauthProviders = oauthManager.getAllProviders();
    const oauthModels = Object.keys(oauthProviders).map(name => ({
      model_id: `oauth-${name}`,
      model_name: `OAuth认证 - ${name}`,
      provider_name: name,
      type: 'oauth',
      hasToken: oauthManager.hasValidTokens(name)
    }));

    // 合并并格式化
    const allModels = [
      ...apiModels.map(m => ({
        id: m.model_id,
        object: 'model',
        created: Date.now(),
        owned_by: m.provider_name,
        type: 'api'
      })),
      ...browserModels.map(m => ({
        id: m.model_id,
        object: 'model',
        created: Date.now(),
        owned_by: m.provider_name,
        type: m.type,
        site: m.site
      })),
      ...oauthModels.map(m => ({
        id: m.model_id,
        object: 'model',
        created: Date.now(),
        owned_by: m.provider_name,
        type: m.type,
        hasToken: m.hasToken
      }))
    ];

    res.json({
      object: 'list',
      data: allModels,
      service_info: {
        api_models_count: apiModels.length,
        browser_models_count: browserModels.length,
        oauth_models_count: oauthModels.length,
        total_models_count: allModels.length
      }
    });
  } catch (error) {
    logger.error('[GATEWAY] Get models error:', error);
    return res.status(500).json({
      error: {
        message: error.message || '获取模型列表失败',
        type: ERROR_TYPES.GATEWAY_ERROR
      }
    });
  }
});

/**
 * API网关信息
 * GET /v1/ai/info
 */
router.get('/v1/ai/info', async (req, res) => {
  try {
    const db = req.app?.locals?.db || globalThis?.db;

    // 统计提供商数量
    const providerCount = await new Promise((resolve) => {
      db.get(`SELECT COUNT(*) as count FROM providers`, (err, row) => {
        resolve(err ? 0 : row?.count || 0);
      });
    });

    // 统计模型数量
    const modelCount = await new Promise((resolve) => {
      db.get(`SELECT COUNT(*) as count FROM models`, (err, row) => {
        resolve(err ? 0 : row?.count || 0);
      });
    });

    // 浏览器站点数量
    const sites = webConfigService.getAllSites();
    const siteCount = Object.keys(sites).filter(d => d !== '_global').length;

    // 浏览器健康状态
    const browserHealth = await browserService.healthCheck();

    // OAuth统计
    const oauthStats = oauthManager.getStats();

    res.json({
      name: 'AI Unified Gateway',
      version: '2.0.0',
      description: '统一AI服务网关 - 集成OpenAI兼容API、浏览器自动化和OAuth认证',
      services: {
        openai_api: {
          enabled: providerCount > 0,
          providers_count: providerCount,
          models_count: modelCount
        },
        browser_automation: {
          enabled: siteCount > 0,
          sites_count: siteCount,
          connected: browserHealth.connected
        },
        oauth: {
          enabled: oauthStats.totalProviders > 0,
          providers_count: oauthStats.totalProviders,
          active_tokens: oauthStats.activeTokens,
          expired_tokens: oauthStats.expiredTokens
        }
      },
      usage_examples: {
        chat_completion: {
          method: 'POST',
          url: '/v1/ai/chat/completions',
          body: {
            model: 'openai:gpt-4',  // 使用OpenAI API
            // model: 'browser:claude.ai',  // 使用浏览器自动化
            // model: 'oauth:google',  // 使用OAuth认证
            // model: 'auto',  // 自动选择
            messages: [{ role: 'user', content: '你好' }],
            stream: true
          }
        },
        get_models: {
          method: 'GET',
          url: '/v1/ai/models'
        }
      },
      base_url: `http://localhost:${process.env.PORT || 3000}`
    });
  } catch (error) {
    logger.error('[GATEWAY] Get info error:', error);
    return res.status(500).json({
      error: {
        message: error.message || '获取网关信息失败',
        type: ERROR_TYPES.GATEWAY_ERROR
      }
    });
  }
});

export default router;
