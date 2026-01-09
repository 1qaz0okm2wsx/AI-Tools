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
import sqlite3 from 'sqlite3';

// 导入浏览器自动化模块
import { browserService } from './src/services/browser/index.js';
import { webConfigService } from './src/services/webConfig.js';
import { logger } from './src/utils/logger.js';
import { DatabasePool } from './src/services/database/pool.js';
import configService from './src/services/config/index.js';
import browserRouter from './routes/browser.js';
import browserViewsRouter from './routes/browser_views.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
/** @type {number} */
let PORT = 3000;
/** @type {string} */
let DB_PATH = './ai_models.db';
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

// 统一从配置服务获取运行参数
const serverConfig = configService.getServerConfig();
const dbConfig = configService.getDatabaseConfig();
const browserConfig = configService.getBrowserConfig();
const loggingConfig = configService.getLoggingConfig();

PORT = serverConfig?.port || 3000;
DB_PATH = dbConfig?.path || './ai_models.db';
BROWSER_ENABLED = browserConfig?.enabled !== false;

// 让 logger 按配置设置日志级别（避免各处直接依赖 process.env）
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

  // Express 推荐的共享依赖挂载点（后续逐步替换 global.*）
  app.locals.db = db;
  app.locals.dbPool = dbPool;

  // 启动连接池清理任务
  dbPool.startCleanup();

  logger.info('✅ 数据库连接池已初始化');
}).catch(/** @type {any} */ error => {
  logger.error('❌ 数据库连接池初始化失败:', error);
  process.exit(1);
});

// 创建表
if (db) {
  db.serialize(() => {
    // 创建AI服务商表
    db.run(`CREATE TABLE IF NOT EXISTS providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        website TEXT,
        api_key TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 创建API密钥表
    db.run(`CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id INTEGER,
        key_name TEXT,
        api_key TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES providers (id)
    )`);

    // 创建API接口地址表
    db.run(`CREATE TABLE IF NOT EXISTS api_endpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id INTEGER,
        endpoint_name TEXT,
        endpoint_url TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES providers (id)
    )`);

    // 创建模型表
    db.run(`CREATE TABLE IF NOT EXISTS models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id INTEGER,
        model_name TEXT NOT NULL,
        model_id TEXT NOT NULL,
        description TEXT,
        category TEXT,
        context_window TEXT,
        capabilities TEXT,
        FOREIGN KEY (provider_id) REFERENCES providers (id)
    )`);

    // 创建操作日志表
    db.run(`CREATE TABLE IF NOT EXISTS operation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_type TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id INTEGER,
        target_name TEXT,
        details TEXT,
        user_ip TEXT,
        user_agent TEXT,
        status TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 创建令牌使用日志表
    db.run(`CREATE TABLE IF NOT EXISTS token_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id INTEGER NOT NULL,
        model_id TEXT NOT NULL,
        api_key_id INTEGER,
        request_tokens INTEGER DEFAULT 0,
        response_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        cost DECIMAL(10, 6) DEFAULT 0.000000,
        request_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        response_time_ms INTEGER,
        status TEXT NOT NULL,
        error_message TEXT,
        FOREIGN KEY (provider_id) REFERENCES providers (id) ON DELETE CASCADE,
        FOREIGN KEY (api_key_id) REFERENCES api_keys (id) ON DELETE SET NULL
    )`);

    // 添加索引
    db.run(`CREATE INDEX IF NOT EXISTS idx_providers_created_at ON providers(created_at DESC)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_models_provider_id ON models(provider_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_models_model_id ON models(model_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_logs_created_at ON operation_logs(created_at DESC)`);
  });
}

// 健康检查
/**
 * @param {any} req
 * @param {any} res
 */
app.get('/health', async (req, res) => {
    /** @type {{
        status: string;
        timestamp: string;
        uptime: number;
        database: { status: string; path: string };
        memory: { used: number; total: number };
        version: string;
        features: { modelManagement: boolean; browserAutomation: boolean };
        browser?: any;
    }} */
    const healthData = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
            status: 'connected',
            path: DB_PATH
        },
        memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100
        },
        version: '2.0.0',
        features: {
            modelManagement: true,
            browserAutomation: BROWSER_ENABLED
        }
    };

    // 如果启用了浏览器功能，添加浏览器状态
    if (BROWSER_ENABLED) {
        try {
            const browserHealth = await browserService.healthCheck();
            healthData.browser = browserHealth;
        } catch (error) {
            healthData.browser = {
                status: 'disconnected',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    res.json(healthData);
});

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
            // 浏览器自动化 (如果启用)
            browser: BROWSER_ENABLED ? {
                chat: 'POST /v1/browser/chat/completions',
                health: 'GET /v1/browser/health',
                models: 'GET /v1/browser/models',
                config: 'GET/POST /api/browser/config',
                open: 'POST /api/browser/open',
                cookies: 'GET/POST/DELETE /api/browser/cookies'
            } : 'disabled',
            // 其他
            health: 'GET /health',
            logs: 'GET /logs',
            export: 'GET /export/json, /export/csv',
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

// 注册API路由
function registerRoutes() {
    // 初始化令牌日志表
    initTokenLogsTable();
    
    try {
        app.use('/', indexRouter);
        app.use('/', providersRouter);
        app.use('/', apiKeysRouter);
        app.use('/', keyStatsRouter);
        app.use('/', tokenLogsRouter);
        app.use('/', modelsListRouter);
        app.use('/', healthRouter);
        app.use('/', logsRouter);
        app.use('/', schedulerRouter);
        app.use('/', chatRouter);
        
        logger.info('✅ API路由已加载');
    } catch (error) {
        logger.warn(`⚠️ 加载API路由失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// 启动服务器
async function startServer() {
    // 注册API路由
    registerRoutes();
    
    // 注册浏览器自动化路由（如果启用）- 放在API路由之后
    if (BROWSER_ENABLED) {
        try {
            await webConfigService.load();
            logger.info('✅ Web配置服务已加载');
            
            await browserService.initialize();
            logger.info('✅ 浏览器服务已初始化');
            
            app.use('/', browserRouter);
            app.use('/', browserViewsRouter);
            logger.info('✅ 浏览器自动化路由已注册');
        } catch (error) {
            logger.warn(`⚠️ 浏览器服务初始化失败: ${error instanceof Error ? error.message : String(error)}`);
            logger.info('浏览器自动化功能将不可用，但其他功能正常运行');
        }
    }
    
    // 错误处理中间件 - 必须在所有路由之后
    app.use((/** @type {any} */ err, /** @type {any} */ req, /** @type {any} */ res, /** @type {any} */ next) => {
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
        console.log(`
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
    
    if (BROWSER_ENABLED) {
        await browserService.close();
    }
    
    /** @param {any} err */
    if (db) {
        db.close((/** @type {any} */ err) => {
            if (err) {
                console.error('关闭数据库连接时出错:', err instanceof Error ? err.message : String(err));
            }
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});

process.on('SIGINT', async () => {
    logger.info('收到 SIGINT 信号，正在关闭服务...');
    
    if (BROWSER_ENABLED) {
        await browserService.close();
    }
    
    /** @param {any} err */
    if (db) {
        db.close((/** @type {any} */ err) => {
            if (err) {
                console.error('关闭数据库连接时出错:', err instanceof Error ? err.message : String(err));
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
