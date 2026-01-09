/**
 * AI模型管理工具 + Web-to-API 统一入口
 * 
 * 功能：
 * 1. AI服务提供商管理
 * 2. 模型检测和管理
 * 3. OpenAI兼容API代理
 * 4. Web-to-API 浏览器自动化
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

import { browserService } from './src/services/browser/index.js';
import { webConfigService } from './src/services/webConfig.js';
import { logger } from './src/utils/logger.js';
import { DatabasePool } from './src/services/database/pool.js';
import configService from './src/services/config/index.js';
import memoryManager from './memory_manager.js';
import apiChecker from './api_checker.js';
import { oauthManager } from './src/services/oauthManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
/** @type {number} */
let PORT = 3000;
/** @type {boolean} */
let BROWSER_ENABLED = true;

// 设置视图引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 中间件
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

// 初始化配置
await configService.load();
configService.validate();

const serverConfig = configService.getServerConfig();
const dbConfig = configService.getDatabaseConfig();
const loggingConfig = configService.getLoggingConfig();

// 从浏览器开关配置文件读取状态
try {
    const browserEnabledPath = path.join(process.cwd(), 'config', 'browser-enabled.json');
    const browserEnabledData = await fs.readFile(browserEnabledPath, 'utf-8');
    const browserEnabledConfig = JSON.parse(browserEnabledData);
    BROWSER_ENABLED = browserEnabledConfig.enabled !== false;
    logger.info(`[BROWSER] 浏览器功能状态: ${BROWSER_ENABLED ? '已启用' : '已禁用'}`);
} catch (error) {
    logger.warn('[BROWSER] 无法读取浏览器开关配置，使用默认值: true');
    BROWSER_ENABLED = true;
}

PORT = serverConfig?.port || 3000;

if (loggingConfig?.level) {
    logger.level = loggingConfig.level;
}

// 初始化数据库连接池
const dbPool = new DatabasePool(dbConfig.path, dbConfig.pool);

// 获取主数据库连接
/** @type {any} */
let db;
await dbPool.acquire().then(({ db: dbConnection }) => {
  db = dbConnection;
  // @ts-ignore
  global.db = db;
  // @ts-ignore
  global.dbPool = dbPool;

  app.locals.db = db;
  app.locals.dbPool = dbPool;

  // 启动连接池清理任务
  dbPool.startCleanup();

  logger.info('✅ 数据库连接池已初始化');
}).catch(/** @type {any} */ error => {
  logger.error('❌ 数据库连接池初始化失败:', error);
  process.exit(1);
});

// 使用db_init.js的初始化函数来创建表
import { initializeDatabase } from './db_init.js';
if (db) {
  initializeDatabase(db);
}

// 根路径 - API信息
/**
 * @param {any} req
 * @param {any} res
 */
app.get('/api', (req, res) => {
    res.json({
        service: 'AI Model Manager + Web-to-API',
        version: '2.0.0',
        endpoints: {
            // 提供商管理
            providers: {
                list: 'GET /',
                add: 'GET/POST /add-provider',
                edit: 'GET/POST /edit-provider/:id',
                delete: 'POST /delete-provider/:id',
                detectModels: 'POST /detect-models/:id'
            },
            // OpenAI兼容接口
            openai: {
                chat: 'POST /v1/chat/completions',
                models: 'GET /v1/models',
                images: 'POST /v1/images/generations',
                audio: 'POST /v1/audio/transcriptions',
                embeddings: 'POST /v1/embeddings'
            },
            // 统一API网关 (推荐使用)
            gateway: {
                chat: 'POST /v1/ai/chat/completions',
                models: 'GET /v1/ai/models',
                info: 'GET /v1/ai/info'
            },
            // 浏览器自动化 (如果启用)
            browser: BROWSER_ENABLED ? {
                chat: 'POST /v1/browser/chat/completions',
                health: 'GET /v1/browser/health',
                models: 'GET /v1/browser/models',
                config: 'GET/POST /api/browser/config',
                open: 'POST /api/browser/open',
                cookies: 'GET/POST/DELETE /api/browser/cookies',
                cookieManager: {
                    list: 'GET /api/cookies',
                    get: 'GET /api/cookies/:domain',
                    save: 'POST /api/cookies/:domain',
                    delete: 'DELETE /api/cookies/:domain',
                    exportAll: 'GET /api/cookies/export?format=json|netcookies|jsonl',
                    exportDomain: 'GET /api/cookies/export/:domain',
                    import: 'POST /api/cookies/import',
                    domains: 'GET /api/cookies/domains',
                    migrate: 'POST /api/cookies/migrate',
                    reencrypt: 'POST /api/cookies/reencrypt'
                }
            } : 'disabled',
            // 其他
            health: 'GET /health',
            logs: 'GET /logs',
            export: 'GET /export/json, /export/csv',
            import: 'POST /import/json, /import/csv',
            database: {
                stats: 'GET /api/database/stats',
                optimize: 'POST /api/database/optimize',
                backup: 'POST /api/database/backup',
                migrate: 'POST /api/database/migrate'
            }
        }
    });
});

// 导入API路由（纯ESM）
import indexRouter from './routes/index.js';
import providersRouter from './routes/providers.js';
import apiKeysRouter from './routes/api_keys.js';
import keyStatsRouter from './routes/key_stats.js';
import tokenLogsRouter, { initTokenLogsTable } from './routes/token_logs.js';
import modelsListRouter from './routes/models_list.js';
import healthRouter from './routes/health.js';
import logsRouter from './routes/logs.js';
import schedulerRouter from './routes/scheduler.js';
import chatRouter from './routes/chat.js';
import databaseRouter from './routes/database.js';
import { startHealthCheck } from './routes/health.js';
import exportRouter from './routes/export.js';
import importRouter from './routes/import.js';
import apiGatewayRouter from './routes/api_gateway.js';
import cookieManagerRouter from './routes/cookie-manager.js';
import apiDocsRouter from './routes/api_docs.js';
import oauthRouter from './routes/oauth.js';

// 注册API路由
async function registerRoutes() {
    // 初始化令牌日志表
    initTokenLogsTable();

    try {
        // 浏览器开关路由（始终加载）
        import('./routes/browser_toggle.js').then(m => {
            app.use('/', m.default);
            logger.info('✅ 浏览器开关路由已加载');
        }).catch(error => {
            logger.warn('⚠️ 浏览器开关路由加载失败:', error instanceof Error ? error.message : String(error));
        });

        // 设置页面路由（始终加载）
        import('./routes/settings.js').then(m => {
            app.use('/', m.default);
            logger.info('✅ 设置路由已加载');
        }).catch(error => {
            logger.warn('⚠️ 设置路由加载失败:', error instanceof Error ? error.message : String(error));
        });

        app.use('/', indexRouter);
        app.use('/', providersRouter);
        app.use('/', apiKeysRouter);
        app.use('/', keyStatsRouter);
        app.use('/', tokenLogsRouter);
        app.use('/', modelsListRouter);
        app.use('/', logsRouter);
        app.use('/', schedulerRouter);
        app.use('/', chatRouter);
        app.use('/', databaseRouter);
        app.use('/', exportRouter);
        app.use('/', importRouter);
        app.use('/', healthRouter);
        app.use('/', apiGatewayRouter);
        app.use('/', cookieManagerRouter);
        app.use('/', oauthRouter);
        app.use('/', apiDocsRouter);

        logger.info('✅ API路由已加载');
    } catch (error) {
        logger.warn(`⚠️ 加载API路由失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// 启动服务器
async function startServer() {
    // 初始化OAuth管理器
    try {
        await oauthManager.init();
        logger.info('✅ OAuth管理器已初始化');
    } catch (error) {
        logger.warn(`⚠️ OAuth管理器初始化失败: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // 注册API路由
    await registerRoutes();
    
    // 启动健康检查任务
    try {
        startHealthCheck();
        logger.info('✅ 健康检查任务已启动');
    } catch (error) {
        logger.warn(`⚠️ 启动健康检查任务失败: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // 启动内存自动清理功能，每30秒清理一次
    memoryManager.startAutoCleanup(30000);
    logger.info('✅ 内存自动清理已启动');
    
    // 获取所有提供商并启动API可用性检查
    try {
        const providers = await new Promise((resolve, reject) => {
            db.all('SELECT id, name, url, api_key FROM providers', (/** @type {any} */ err, /** @type {any} */ rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        // 启动API可用性检查，每60秒检查一次
        apiChecker.startPeriodicCheck(providers, 60000);
        logger.info('✅ API可用性检查已启动');
    } catch (error) {
        logger.warn(`⚠️ 启动API可用性检查失败: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // 服务器启动后自动检测所有提供商的模型
    try {
        const { autoDetectAllModels } = await import('./routes/providers.js');
        await autoDetectAllModels(db);
        logger.info('✅ 服务器启动时的模型自动检测已完成');
    } catch (error) {
        logger.warn(`⚠️ 服务器启动时的模型自动检测失败: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // 注册浏览器自动化路由（如果启用）- 放在API路由之后
    if (BROWSER_ENABLED) {
        try {
            // 动态加载浏览器路由（仅在启用时）
            const browserRouterModule = await import('./routes/browser.js');
            const browserViewsRouterModule = await import('./routes/browser_views.js');

            await webConfigService.load();
            logger.info('✅ Web配置服务已加载');

            // 尝试初始化浏览器服务，但不阻塞服务启动
            try {
                await browserService.initialize();
                logger.info('✅ 浏览器服务已初始化');
            } catch (browserError) {
                logger.warn(`⚠️  浏览器服务初始化失败（浏览器功能将不可用）: ${browserError instanceof Error ? browserError.message : String(browserError)}`);
                logger.warn(`💡 要使用浏览器功能，请先运行 "启动Chrome.bat" 启动Chrome远程调试模式`);
                // 不抛出错误，继续启动服务
            }

            app.use('/', browserRouterModule.default);
            app.use('/', browserViewsRouterModule.default);
            logger.info('✅ 浏览器自动化路由已注册');
        } catch (error) {
            logger.warn(`⚠️  浏览器路由注册失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // 错误处理中间件 - 必须在所有路由之后
    app.use((/** @type {any} */ err, /** @type {any} */ req, /** @type {any} */ res, /** @type {any} */ _next) => {
        logger.error('未处理的错误:', err);
        res.status(500).json({
            error: {
                message: '服务器内部错误',
                type: 'internal_error'
            }
        });
    });

    // 404 处理 - 必须在所有路由之后
    /**
     * @param {any} req
     * @param {any} res
     */
    app.use((req, res) => {
        res.status(404).json({
            error: {
                message: '接口不存在',
                path: req.path
            }
        });
    });
    
    app.listen(PORT, () => {
        logger.info(`
========================================
  AI模型管理工具 + Web-to-API
========================================
  服务地址: http://localhost:${PORT}
  
  功能模块:
  ✅ 提供商管理
  ✅ 模型检测
  ✅ OpenAI兼容API代理
  ${BROWSER_ENABLED ? '✅' : '❌'} 浏览器自动化 (Web-to-API)
  
  API文档: http://localhost:${PORT}/api
  健康检查: http://localhost:${PORT}/health
========================================
        `);
    });
}

// 优雅关闭
process.on('SIGTERM', async () => {
    logger.info('收到 SIGTERM 信号，正在关闭服务...');
    
    // 停止内存自动清理
    memoryManager.stopAutoCleanup();
    
    // 停止API可用性检查
    apiChecker.stopPeriodicCheck();
    
    if (BROWSER_ENABLED) {
        await browserService.close();
    }
    
    /** @param {any} err */
    if (db) {
        db.close((/** @type {any} */ err) => {
            if (err) {
                logger.error('关闭数据库连接时出错:', err instanceof Error ? err.message : String(err));
            }
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});

process.on('SIGINT', async () => {
    logger.info('收到 SIGINT 信号，正在关闭服务...');
    
    // 停止内存自动清理
    memoryManager.stopAutoCleanup();
    
    // 停止API可用性检查
    apiChecker.stopPeriodicCheck();
    
    if (BROWSER_ENABLED) {
        await browserService.close();
    }
    
    /** @param {any} err */
    if (db) {
        db.close((/** @type {any} */ err) => {
            if (err) {
                logger.error('关闭数据库连接时出错:', err instanceof Error ? err.message : String(err));
            }
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});

// 启动
startServer();

export default app;
