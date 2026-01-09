/**
 * 浏览器自动化路由模块
 * 提供 Web-to-API 功能的 OpenAI 兼容接口
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import Joi from 'joi';
import { browserService } from '../src/services/browser/index.js';
import { webConfigService } from '../src/services/webConfig.js';
import { cookieManager } from '../src/services/cookieManager.js';
import { requestManager } from '../src/services/requestManager.js';
import { logger, logCollector, DetailedErrorTypes } from '../src/utils/logger.js';
import { errorHandler } from '../src/utils/errorHandler.js';

const router = express.Router();

// ================= 请求验证模式 =================

const chatCompletionSchema = Joi.object({
  model: Joi.string().default('web-browser'),
  messages: Joi.array().items(
    Joi.object({
      role: Joi.string().valid('user', 'assistant', 'system'),
      content: Joi.string()
    })
  ).required(),
  stream: Joi.boolean().default(true),
  temperature: Joi.number().min(0).max(2).default(0.7),
  max_tokens: Joi.number().min(1).optional()
});

// ================= 浏览器聊天 API =================

/**
 * 浏览器自动化聊天接口
 * POST /v1/browser/chat/completions
 */
router.post('/v1/browser/chat/completions', async (req, res) => {
  try {
    // 验证请求
    const { error, value } = chatCompletionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: {
          message: `请求验证失败: ${error.details[0].message}`,
          type: 'invalid_request_error'
        }
      });
    }

    const { messages, stream } = value;

    // 创建请求上下文
    const ctx = requestManager.createRequest();
    logger.info(`请求 [${ctx.requestId}] 开始...`);

    if (stream) {
      // 流式响应
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      try {
        // 获取锁
        const acquired = await requestManager.acquire(ctx, 60000);
        if (!acquired) {
          const reason = ctx.cancelReason || '获取锁失败';
          logger.warn(`请求 [${ctx.requestId}] ${reason}`);
          res.write(`data: ${JSON.stringify({ error: { message: `服务繁忙: ${reason}` }})}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }

        // 设置停止检查器
        browserService.setStopChecker(() => ctx.shouldStop());

        try {
          // 执行工作流
          for await (const chunk of browserService.executeWorkflow(messages, true)) {
            if (ctx.shouldStop()) {
              logger.info(`请求 [${ctx.requestId}] 被取消`);
              break;
            }
            res.write(chunk);
          }
        } finally {
          requestManager.release(ctx, ctx.status === 'completed');
          logger.info(`请求 [${ctx.requestId}] 结束 (状态: ${ctx.status})`);
        }
      } catch (error) {
        logger.error('流式响应错误:', error);
        res.write(`data: ${JSON.stringify({ error: { message: /** @type {Error} */ (error).message } })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
    } else {
      // 非流式响应
      let collectedContent = [];
      let errorData = null;

      try {
        const acquired = await requestManager.acquire(ctx, 60000);
        if (!acquired) {
          return res.status(500).json({
            error: {
              message: '服务繁忙',
              type: 'busy_error'
            }
          });
        }

        browserService.setStopChecker(() => ctx.shouldStop());

        try {
          for await (const chunk of browserService.executeWorkflow(messages, false)) {
            if (chunk.startsWith('data: [DONE]')) {
              continue;
            }

            if (chunk.startsWith('data: ')) {
              try {
                const dataStr = chunk.slice(6).trim();
                if (!dataStr) continue;

                const data = JSON.parse(dataStr);

                if (data.error) {
                  errorData = data;
                  break;
                }

                if (data.choices && data.choices[0]) {
                  const delta = data.choices[0].delta || {};
                  const content = delta.content || '';
                  if (content) {
                    collectedContent.push(content);
                  }
                }
              } catch (_e) {
                // 忽略解析错误
              }
            }
          }
        } finally {
          requestManager.release(ctx, !errorData);
        }
      } catch (error) {
        logger.error('非流式响应错误:', error);
        return res.status(500).json({
          error: {
            message: /** @type {Error} */ (error).message,
            type: 'internal_error'
          }
        });
      }

      if (errorData) {
        return res.status(500).json(errorData);
      }

      const fullContent = collectedContent.join('');
      const response = {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: req.body.model || 'web-browser',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: fullContent
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      };

      res.json(response);
    }
  } catch (error) {
    logger.error('聊天完成错误:', error);
    res.status(500).json({
      error: {
        message: '服务器内部错误',
        type: 'internal_error'
      }
    });
  }
});

// ================= 浏览器健康检查 =================

router.get('/v1/browser/health', async (req, res) => {
  try {
    const browserHealth = await browserService.healthCheck();
    const sites = webConfigService.getAllSites();

    const response = {
      service: 'healthy',
      version: '2.0.0',
      browser: browserHealth,
      config: {
        sites_loaded: Object.keys(sites).length
      },
      timestamp: Math.floor(Date.now() / 1000)
    };

    const statusCode = browserHealth.connected ? 200 : 503;
    res.status(statusCode).json(response);
  } catch (error) {
    res.status(500).json({
      service: 'unhealthy',
      error: /** @type {Error} */ (error).message
    });
  }
});

// ================= 浏览器模型列表 =================

router.get('/v1/browser/models', (req, res) => {
  const sites = webConfigService.getAllSites();
  const models = Object.keys(sites)
    .filter(domain => domain !== '_global')
    .map(domain => ({
      id: `web-${domain}`,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'web-browser'
    }));

  // 添加默认模型
  models.unshift({
    id: 'web-browser',
    object: 'model',
    created: Math.floor(Date.now() / 1000),
    owned_by: 'universal-web-api'
  });

  res.json({
    object: 'list',
    data: models
  });
});

// ================= 站点配置管理 =================

router.get('/api/browser/config', (req, res) => {
  try {
    const sites = webConfigService.getAllSites();
    res.json(sites);
  } catch (error) {
    logger.error('获取配置失败:', error);
    res.status(500).json({ error: /** @type {Error} */ (error).message });
  }
});

router.post('/api/browser/config', async (req, res) => {
  try {
    const { config } = req.body;

    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: '无效的配置格式' });
    }

    for (const [domain, siteConfig] of Object.entries(config)) {
      await webConfigService.saveSiteConfig(domain, siteConfig);
    }

    res.json({
      status: 'success',
      message: '配置已保存',
      sites_count: Object.keys(config).length
    });
  } catch (error) {
    logger.error('保存配置失败:', error);
    res.status(500).json({ error: /** @type {Error} */ (error).message });
  }
});

router.delete('/api/browser/config/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    const success = await webConfigService.deleteSiteConfig(domain);

    if (success) {
      res.json({ status: 'success', message: `已删除: ${domain}` });
    } else {
      res.status(404).json({ error: `配置不存在: ${domain}` });
    }
  } catch (error) {
    logger.error('删除配置失败:', error);
    res.status(500).json({ error: /** @type {Error} */ (error).message });
  }
});

// ================= 浏览器控制 =================

router.post('/api/browser/open', async (req, res) => {
  try {
    const { site } = req.body;

    if (!site) {
      return res.status(400).json({
        error: '网站域名不能为空'
      });
    }

    // 先尝试初始化浏览器连接
    try {
      await browserService.initialize();
    } catch (initError) {
      logger.error('浏览器初始化失败:', initError);
      return res.status(503).json({
        status: 'error',
        error: '浏览器连接失败',
        message: /** @type {Error} */ (initError).message
      });
    }

    // 检查浏览器是否已连接
    const health = await browserService.healthCheck();
    if (!health.connected) {
      return res.status(503).json({
        status: 'error',
        error: '浏览器未连接',
        message: health.error || '请运行"启动Chrome.bat"启动Chrome远程调试模式'
      });
    }

    const page = browserService.getPage();
    const siteConfig = webConfigService.getSiteConfig(site);

    if (!siteConfig) {
      return res.status(404).json({
        error: `未找到网站配置：${site}`
      });
    }

    const targetUrl = siteConfig.url || `https://${site}`;

    logger.info(`正在打开网站: ${targetUrl}`);

    // 先尝试加载cookies
    const cookies = await cookieManager.loadCookies(site);

    if (cookies && cookies.length > 0) {
      await page.setCookie(...cookies);
      logger.info(`[COOKIE] 已加载 ${cookies.length} 个cookies`);
    }

    // 打开网站
    await page.goto(targetUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // 等待页面加载
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 保存cookies
    const currentCookies = await page.cookies();
    await cookieManager.saveCookies(site, currentCookies);
    
    res.json({
      status: 'success',
      site,
      url: targetUrl,
      message: `网站已打开：${targetUrl}`
    });
  } catch (error) {
    logger.error('打开网站失败:', error);
    res.status(500).json({
      error: /** @type {Error} */ (error).message
    });
  }
});

// ================= Cookie 管理 =================

router.post('/api/browser/cookies/save', async (req, res) => {
  try {
    const page = browserService.getPage();
    const url = page.url();
    const domain = url.split('//')[1]?.split('/')[0] || 'unknown';
    
    const cookies = await page.cookies();
    await cookieManager.saveCookies(domain, cookies);
    
    res.json({
      status: 'success',
      domain,
      count: cookies.length,
      message: `已保存 ${cookies.length} 个cookies`
    });
  } catch (error) {
    logger.error('保存cookies失败:', error);
    res.status(500).json({
      error: /** @type {Error} */ (error).message
    });
  }
});

router.get('/api/browser/cookies/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    const cookies = await cookieManager.loadCookies(domain);
    
    if (!cookies) {
      return res.status(404).json({
        error: `未找到 ${domain} 的cookies`
      });
    }
    
    res.json({
      domain,
      count: cookies.length,
      cookies
    });
  } catch (error) {
    logger.error('获取cookies失败:', error);
    res.status(500).json({
      error: /** @type {Error} */ (error).message
    });
  }
});

router.get('/api/browser/cookies', async (req, res) => {
  try {
    const domains = await cookieManager.listDomains();
    
    res.json({
      domains,
      count: domains.length
    });
  } catch (error) {
    logger.error('列出cookies失败:', error);
    res.status(500).json({
      error: /** @type {Error} */ (error).message
    });
  }
});

router.delete('/api/browser/cookies/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    await cookieManager.deleteCookies(domain);
    
    res.json({
      status: 'success',
      domain,
      message: `已删除 ${domain} 的cookies`
    });
  } catch (error) {
    logger.error('删除cookies失败:', error);
    res.status(500).json({
      error: /** @type {Error} */ (error).message
    });
  }
});

// ================= 日志 API =================

router.get('/api/browser/logs', (req, res) => {
  try {
    const since = parseFloat(/** @type {string} */ (req.query.since) || '0') || 0;
    const logs = logCollector.getRecent(since);
    res.json({ logs, timestamp: Date.now() / 1000 });
  } catch (error) {
    logger.error('获取日志失败:', error);
    res.status(500).json({ error: /** @type {Error} */ (error).message });
  }
});

router.delete('/api/browser/logs', (req, res) => {
  try {
    logCollector.clear();
    res.json({ status: 'success' });
  } catch (error) {
    logger.error('清除日志失败:', error);
    res.status(500).json({ error: /** @type {Error} */ (error).message });
  }
});

// ================= 错误类型 API =================

router.get('/api/browser/errors/types', (req, res) => {
  try {
    const types = Object.entries(DetailedErrorTypes).map(([key, value]) => ({
      type: key,
      code: value.code,
      category: value.category,
      message: value.message,
      solution: value.solution
    }));
    
    res.json({
      total: types.length,
      types
    });
  } catch (error) {
    logger.error('获取错误类型失败:', error);
    res.status(500).json({ error: /** @type {Error} */ (error).message });
  }
});

router.get('/api/browser/errors/stats', (req, res) => {
  try {
    const stats = errorHandler.getErrorStats();
    res.json(stats);
  } catch (error) {
    logger.error('获取错误统计失败:', error);
    res.status(500).json({ error: /** @type {Error} */ (error).message });
  }
});

export default router;