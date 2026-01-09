# API-Tools 项目重构与优化计划

## 📋 项目现状

✅ **已完成（Sprint 0 - 基础修复）**
- TypeScript 类型错误修复（180+个错误）
- 数据库结构完善（api_keys、token_logs 表）
- 模块系统统一（全部 ESM）
- 基础类型声明文件
- 项目功能正常运行

## 🎯 敏捷开发计划（6个Sprint）

---

### Sprint 1: 核心安全与稳定性（优先级：🔴 高）
**工期**: 5个工作日  
**目标**: 解决安全隐患和关键稳定性问题

#### 1.1 API密钥管理优化
**当前问题**:
- 密钥轮换逻辑复杂，可能导致性能问题
- 缺少密钥有效性验证
- 错误统计机制不够精简

**改进方案**:
```javascript
// 简化的密钥选择策略
class SimplifiedKeyManager {
  // 1. 使用简单的轮询策略
  selectKey(provider) {
    const keys = this.getAvailableKeys(provider);
    return keys[this.currentIndex++ % keys.length];
  }
  
  // 2. 添加密钥健康检查
  async validateKey(key) {
    try {
      const response = await this.testKeyRequest(key);
      return response.status === 200;
    } catch {
      return false;
    }
  }
  
  // 3. 实现密钥黑名单机制
  blacklistKey(key, duration = 3600000) {
    this.blacklist.set(key.id, Date.now() + duration);
  }
}
```

**验收标准**:
- [ ] 密钥轮换性能提升 50%
- [ ] 添加密钥验证端点 `/api/keys/validate`
- [ ] 编写单元测试（覆盖率 >80%）

**文件变更**:
- [`modelAnalyzer_enhanced.js`](../modelAnalyzer_enhanced.js) - 重构
- [`routes/api_keys.js`](../routes/api_keys.js) - 添加验证逻辑

---

#### 1.2 Cookie安全性加强
**当前问题**:
- Cookies 明文存储在 JSON 文件中
- 无过期检查机制
- 缺少加密保护

**改进方案**:
```javascript
// 添加加密存储
import crypto from 'crypto';

class SecureCookieManager {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.key = this.deriveKey();
  }
  
  deriveKey() {
    const secret = process.env.COOKIE_ENCRYPTION_KEY || 'default-secret';
    return crypto.scryptSync(secret, 'salt', 32);
  }
  
  encrypt(data) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(data), 'utf8'),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();
    
    return {
      iv: iv.toString('hex'),
      data: encrypted.toString('hex'),
      tag: authTag.toString('hex')
    };
  }
  
  decrypt(encrypted) {
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.key,
      Buffer.from(encrypted.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));
    
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted.data, 'hex')),
      decipher.final()
    ]);
    
    return JSON.parse(decrypted.toString('utf8'));
  }
  
  checkExpiry(cookie) {
    if (cookie.expires) {
      const expiryTime = new Date(cookie.expires).getTime();
      return Date.now() < expiryTime;
    }
    return true; // Session cookies
  }
  
  async saveCookies(domain, cookies) {
    // 过滤过期cookies
    const validCookies = cookies.filter(c => this.checkExpiry(c));
    
    // 加密存储
    const encrypted = this.encrypt(validCookies);
    await fs.writeFile(
      path.join(this.cookiesDir, `${domain}.enc`),
      JSON.stringify(encrypted),
      'utf-8'
    );
  }
}
```

**环境变量配置**:
```bash
# .env
COOKIE_ENCRYPTION_KEY=your-strong-random-secret-key-here
```

**验收标准**:
- [ ] Cookies 加密存储（AES-256-GCM）
- [ ] 自动清理过期 cookies
- [ ] 添加集成测试
- [ ] 迁移现有明文 cookies

**文件变更**:
- [`src/services/cookieManager.js`](../src/services/cookieManager.js) - 完全重写
- 新增 [`src/utils/encryption.js`](../src/utils/encryption.js)
- 新增迁移脚本 [`scripts/migrate-cookies.js`](../scripts/migrate-cookies.js)

---

#### 1.3 错误处理完善
**当前问题**:
- 某些路由缺少错误处理
- 错误信息在生产环境暴露过多细节
- 缺少统一的错误格式

**改进方案**:
```javascript
// src/middleware/errorHandler.js
export const errorMiddleware = (err, req, res, next) => {
  // 记录完整错误
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });
  
  // 确定错误类型和状态码
  const status = err.status || err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  
  // 生产环境隐藏详细信息
  const response = {
    error: {
      message: isProduction && status === 500 
        ? '服务器内部错误' 
        : err.message,
      code: err.code || 'INTERNAL_ERROR',
      ...(isProduction ? {} : { stack: err.stack })
    }
  };
  
  res.status(status).json(response);
};

// 异步路由包装器
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
```

**应用示例**:
```javascript
// routes/browser.js
router.get('/api/browser/health', asyncHandler(async (req, res) => {
  const health = await browserService.healthCheck();
  res.json(health);
}));

// app.js
app.use(errorMiddleware); // 作为最后一个中间件
```

**验收标准**:
- [ ] 所有路由添加错误处理
- [ ] 生产环境不暴露堆栈信息
- [ ] 添加错误监控和告警
- [ ] 统一错误响应格式

**文件变更**:
- [`routes/*.js`](../routes/) - 所有路由添加 asyncHandler
- 新增 [`src/middleware/errorHandler.js`](../src/middleware/errorHandler.js)
- [`index.js`](../index.js) - 添加错误中间件

---

### Sprint 2: 性能优化（优先级：🟡 中高）
**工期**: 3个工作日  
**目标**: 提升系统性能和并发处理能力

#### 2.1 请求管理器并发支持
**当前问题**:
- 只支持单个活动请求
- 限制了系统并发处理能力
- 新请求会取消旧请求

**改进方案**:
```javascript
class ConcurrentRequestManager {
  constructor() {
    this.maxConcurrent = parseInt(process.env.MAX_CONCURRENT_REQUESTS) || 5;
    this.activeRequests = new Map();  // requestId => RequestContext
    this.queue = [];  // 等待队列
    this.requestHistory = [];
  }
  
  async acquire(ctx, timeout = 60000) {
    const startTime = Date.now();
    
    // 如果未达到并发上限，直接执行
    if (this.activeRequests.size < this.maxConcurrent) {
      this.activeRequests.set(ctx.requestId, ctx);
      ctx.start();
      logger.info(`[REQUEST] ${ctx.requestId} 开始执行 (活动: ${this.activeRequests.size}/${this.maxConcurrent})`);
      return true;
    }
    
    // 否则加入队列
    logger.info(`[REQUEST] ${ctx.requestId} 加入队列 (队列长度: ${this.queue.length + 1})`);
    this.queue.push(ctx);
    
    // 等待队列处理
    while (this.activeRequests.size >= this.maxConcurrent) {
      if (Date.now() - startTime > timeout) {
        this.queue = this.queue.filter(r => r.requestId !== ctx.requestId);
        ctx.cancel('队列等待超时');
        return false;
      }
      
      if (ctx.shouldStop()) {
        this.queue = this.queue.filter(r => r.requestId !== ctx.requestId);
        ctx.cancel('在队列中被取消');
        return false;
      }
      
      await this.delay(100);
    }
    
    // 从队列中移除并开始执行
    this.queue = this.queue.filter(r => r.requestId !== ctx.requestId);
    this.activeRequests.set(ctx.requestId, ctx);
    ctx.start();
    return true;
  }
  
  release(ctx) {
    if (this.activeRequests.has(ctx.requestId)) {
      this.activeRequests.delete(ctx.requestId);
      ctx.complete();
      this.recordHistory(ctx);
      
      logger.info(`[REQUEST] ${ctx.requestId} 完成 (耗时: ${ctx.getDuration()}ms, 活动: ${this.activeRequests.size}/${this.maxConcurrent})`);
      
      // 处理队列中的下一个请求
      this.processQueue();
    }
  }
  
  processQueue() {
    if (this.queue.length > 0 && this.activeRequests.size < this.maxConcurrent) {
      logger.debug(`[QUEUE] 处理队列，剩余: ${this.queue.length}`);
    }
  }
  
  getStats() {
    return {
      activeRequests: this.activeRequests.size,
      queuedRequests: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      totalProcessed: this.requestHistory.length,
      avgDuration: this.calculateAvgDuration()
    };
  }
}
```

**配置**:
```bash
# .env
MAX_CONCURRENT_REQUESTS=5
```

**验收标准**:
- [ ] 支持配置并发数（默认5）
- [ ] 实现请求队列机制
- [ ] 性能测试通过（QPS 提升3倍）
- [ ] 添加并发统计API

**文件变更**:
- [`src/services/requestManager.js`](../src/services/requestManager.js) - 完全重写

---

#### 2.2 浏览器实例生命周期管理
**当前问题**:
- 实例未正确释放，可能导致内存泄漏
- 缺少健康检查机制
- 无自动恢复能力

**改进方案**:
```javascript
class BrowserLifecycleManager {
  constructor() {
    this.instances = new Map();
    this.healthCheckInterval = 30000; // 30秒
    this.maxMemoryMB = 500;
  }
  
  startHealthCheck() {
    this.healthTimer = setInterval(async () => {
      for (const [id, instance] of this.instances) {
        const isHealthy = await this.checkInstance(instance);
        
        if (!isHealthy) {
          logger.warn(`[HEALTH] 实例 ${id} 不健康，准备重启`);
          await this.restartInstance(id);
        }
      }
    }, this.healthCheckInterval);
  }
  
  async checkInstance(instance) {
    try {
      // 检查浏览器连接
      if (!instance.browser || !instance.browser.isConnected()) {
        return false;
      }
      
      // 检查页面响应
      const pages = await instance.browser.pages();
      if (pages.length === 0) {
        return false;
      }
      
      // 检查内存使用
      const metrics = await pages[0].metrics();
      const memoryMB = metrics.JSHeapUsedSize / 1024 / 1024;
      
      if (memoryMB > this.maxMemoryMB) {
        logger.warn(`[HEALTH] 内存使用过高: ${memoryMB.toFixed(2)}MB`);
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error(`[HEALTH] 检查失败: ${error.message}`);
      return false;
    }
  }
  
  async restartInstance(id) {
    logger.info(`[LIFECYCLE] 重启实例 ${id}`);
    
    const instance = this.instances.get(id);
    if (instance) {
      await instance.browser?.close();
      this.instances.delete(id);
    }
    
    // 创建新实例
    const newInstance = await this.createInstance();
    this.instances.set(id, newInstance);
    
    logger.info(`[LIFECYCLE] 实例 ${id} 重启完成`);
  }
  
  async gracefulShutdown() {
    logger.info('[LIFECYCLE] 开始优雅关机...');
    
    // 停止健康检查
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
    }
    
    // 等待活动请求完成（最多30秒）
    const maxWait = 30000;
    const startTime = Date.now();
    
    while (requestManager.activeRequests.size > 0) {
      if (Date.now() - startTime > maxWait) {
        logger.warn('[LIFECYCLE] 等待超时，强制关闭');
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // 关闭所有实例
    for (const [id, instance] of this.instances) {
      logger.info(`[LIFECYCLE] 关闭实例 ${id}`);
      await instance.browser?.close();
    }
    
    this.instances.clear();
    logger.info('[LIFECYCLE] 优雅关机完成');
  }
}
```

**信号处理**:
```javascript
// index.js
const lifecycleManager = new BrowserLifecycleManager();

process.on('SIGTERM', async () => {
  logger.info('收到 SIGTERM 信号');
  await lifecycleManager.gracefulShutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('收到 SIGINT 信号');
  await lifecycleManager.gracefulShutdown();
  process.exit(0);
});
```

**验收标准**:
- [ ] 定期健康检查（每30秒）
- [ ] 自动重启异常实例
- [ ] 优雅关机机制
- [ ] 添加生命周期事件监控

**文件变更**:
- [`src/services/browser/pool.js`](../src/services/browser/pool.js) - 增强
- [`src/services/browser/connection.js`](../src/services/browser/connection.js) - 优化
- 新增 [`src/services/browser/lifecycle.js`](../src/services/browser/lifecycle.js)

---

### Sprint 3: 架构改进（优先级：🟡 中）
**工期**: 5个工作日  
**目标**: 提升代码质量和可维护性

#### 3.1 提取公共错误处理逻辑
**当前问题**:
- 多个文件中存在重复的错误处理代码
- 错误处理不一致

**改进方案**:
```javascript
// src/utils/commonHandlers.js
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const validateRequest = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ 
      error: { 
        message: error.details[0].message,
        type: 'validation_error'
      } 
    });
  }
  next();
};

export const requireAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  if (!apiKey || !isValidApiKey(apiKey)) {
    return res.status(401).json({
      error: {
        message: '无效的API密钥',
        type: 'authentication_error'
      }
    });
  }
  next();
};

export const rateLimiter = (maxRequests = 100, windowMs = 60000) => {
  const requests = new Map();
  
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    if (!requests.has(key)) {
      requests.set(key, []);
    }
    
    const userRequests = requests.get(key);
    const recentRequests = userRequests.filter(time => time > windowStart);
    
    if (recentRequests.length >= maxRequests) {
      return res.status(429).json({
        error: {
          message: '请求过于频繁',
          type: 'rate_limit_error',
          retry_after: Math.ceil((recentRequests[0] + windowMs - now) / 1000)
        }
      });
    }
    
    recentRequests.push(now);
    requests.set(key, recentRequests);
    next();
  };
};
```

**应用示例**:
```javascript
// routes/providers.js
import { asyncHandler, validateRequest, rateLimiter } from '../src/utils/commonHandlers.js';

router.post('/api/providers', 
  rateLimiter(50, 60000),
  validateRequest(providerSchema), 
  asyncHandler(async (req, res) => {
    const provider = await createProvider(req.body);
    res.json(provider);
  })
);
```

**验收标准**:
- [ ] 创建公共处理模块
- [ ] 重构所有路由使用公共逻辑
- [ ] 代码重复率降低 40%
- [ ] 添加单元测试

**文件变更**:
- 新增 [`src/utils/commonHandlers.js`](../src/utils/commonHandlers.js)
- 新增 [`src/middleware/rateLimit.js`](../src/middleware/rateLimit.js)
- [`routes/*.js`](../routes/) - 全部重构

---

#### 3.2 统一配置管理
**当前问题**:
- 配置分散（.env、browser_config.json、sites.json、app.json）
- 缺少配置验证
- 环境切换不方便

**改进方案**:
```
config/
├── default.json          # 默认配置
├── development.json      # 开发环境
├── production.json       # 生产环境
├── test.json            # 测试环境
├── schema.js            # Joi 验证模式
└── index.js             # 配置管理器
```

```javascript
// config/schema.js
import Joi from 'joi';

export const configSchema = Joi.object({
  server: Joi.object({
    port: Joi.number().port().default(3000),
    host: Joi.string().default('0.0.0.0'),
    cors: Joi.object({
      origin: Joi.alternatives().try(
        Joi.string(),
        Joi.array().items(Joi.string())
      ).default('*'),
      credentials: Joi.boolean().default(true)
    })
  }),
  
  database: Joi.object({
    path: Joi.string().default('./database.sqlite'),
    poolSize: Joi.number().integer().min(1).max(10).default(5)
  }),
  
  browser: Joi.object({
    poolSize: Joi.number().integer().min(1).max(10).default(3),
    headless: Joi.boolean().default(true),
    timeout: Joi.number().integer().min(1000).default(30000),
    maxMemoryMB: Joi.number().integer().min(100).default(500)
  }),
  
  request: Joi.object({
    maxConcurrent: Joi.number().integer().min(1).max(20).default(5),
    queueTimeout: Joi.number().integer().min(1000).default(60000)
  }),
  
  cookie: Joi.object({
    encryptionKey: Joi.string().min(32).required(),
    storageDir: Joi.string().default('./cookies')
  }),
  
  logging: Joi.object({
    level: Joi.string().valid('debug', 'info', 'warn', 'error').default('info'),
    maxFiles: Joi.number().integer().min(1).default(10),
    maxSize: Joi.string().default('10m')
  })
});

// config/index.js
import fs from 'fs/promises';
import path from 'path';
import { configSchema } from './schema.js';

class ConfigManager {
  constructor() {
    this.config = null;
    this.env = process.env.NODE_ENV || 'development';
  }
  
  async load() {
    // 加载默认配置
    const defaultConfig = await this.loadJSON('default.json');
    
    // 加载环境特定配置
    const envConfig = await this.loadJSON(`${this.env}.json`);
    
    // 合并配置
    const merged = this.deepMerge(defaultConfig, envConfig);
    
    // 从环境变量覆盖
    const withEnv = this.applyEnvOverrides(merged);
    
    // 验证配置
    const { error, value } = configSchema.validate(withEnv, {
      abortEarly: false,
      allowUnknown: false
    });
    
    if (error) {
      throw new Error(`配置验证失败: ${error.details.map(d => d.message).join(', ')}`);
    }
    
    this.config = value;
    logger.info(`[CONFIG] 配置加载完成 (环境: ${this.env})`);
    return this.config;
  }
  
  async loadJSON(filename) {
    try {
      const content = await fs.readFile(
        path.join(process.cwd(), 'config', filename),
        'utf-8'
      );
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }
  
  applyEnvOverrides(config) {
    return {
      ...config,
      server: {
        ...config.server,
        port: parseInt(process.env.PORT) || config.server?.port
      },
      cookie: {
        ...config.cookie,
        encryptionKey: process.env.COOKIE_ENCRYPTION_KEY || config.cookie?.encryptionKey
      },
      logging: {
        ...config.logging,
        level: process.env.LOG_LEVEL || config.logging?.level
      }
    };
  }
  
  get(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], this.config);
  }
  
  deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] instanceof Object && key in target) {
        result[key] = this.deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }
}

export const config = new ConfigManager();
```

**使用示例**:
```javascript
// index.js
import { config } from './config/index.js';

await config.load();

const app = express();
app.listen(config.get('server.port'), () => {
  logger.info(`服务器运行在端口 ${config.get('server.port')}`);
});
```

**验收标准**:
- [ ] 单一配置入口
- [ ] 配置验证机制
- [ ] 环境特定配置支持
- [ ] 文档更新

**文件变更**:
- 重构整个 [`config/`](../config/) 目录
- 更新所有配置引用

---

### Sprint 4: 输入验证（优先级：🟡 中）
**工期**: 3个工作日  
**目标**: 全面的输入验证机制

#### 4.1 添加 Joi 验证
**依赖**:
```bash
npm install joi
```

**验证模式**:
```javascript
// src/validation/schemas.js
import Joi from 'joi';

export const providerSchema = Joi.object({
  name: Joi.string().min(3).max(50).required(),
  url: Joi.string().uri().required(),
  website: Joi.string().uri().allow('').optional(),
  api_key: Joi.string().min(20).optional(),
  models: Joi.array().items(Joi.string()).optional()
});

export const apiKeySchema = Joi.object({
  provider_id: Joi.number().integer().positive().required(),
  key_name: Joi.string().min(3).max(50).required(),
  api_key: Joi.string().min(20).required(),
  is_active: Joi.boolean().default(true)
});

export const chatCompletionSchema = Joi.object({
  model: Joi.string().required(),
  messages: Joi.array().items(
    Joi.object({
      role: Joi.string().valid('user', 'assistant', 'system').required(),
      content: Joi.string().required()
    })
  ).min(1).required(),
  stream: Joi.boolean().default(true),
  temperature: Joi.number().min(0).max(2).default(0.7),
  max_tokens: Joi.number().integer().positive().optional(),
  top_p: Joi.number().min(0).max(1).optional(),
  frequency_penalty: Joi.number().min(-2).max(2).optional(),
  presence_penalty: Joi.number().min(-2).max(2).optional()
});

export const siteConfigSchema = Joi.object({
  url: Joi.string().uri().required(),
  name: Joi.string().min(2).max(100).required(),
  selectors: Joi.object({
    input: Joi.string().required(),
    submit: Joi.string().required(),
    output: Joi.string().required(),
    loading: Joi.string().optional()
  }).required(),
  waitTimes: Joi.object({
    afterInput: Joi.number().integer().min(0).default(500),
    afterSubmit: Joi.number().integer().min(0).default(1000),
    maxWait: Joi.number().integer().min(1000).default(60000)
  }).optional()
});
```

**应用验证**:
```javascript
// routes/providers.js
import { validateRequest } from '../src/utils/commonHandlers.js';
import { providerSchema } from '../src/validation/schemas.js';

router.post('/api/providers', 
  validateRequest(providerSchema), 
  asyncHandler(async (req, res) => {
    const provider = await createProvider(req.body);
    res.json(provider);
  })
);
```

**验收标准**:
- [ ] 所有 POST/PUT 端点添加验证
- [ ] 创建完整的验证模式库
- [ ] 添加验证错误测试
- [ ] 文档化所有验证规则

**文件变更**:
- 新增 [`src/validation/schemas.js`](../src/validation/schemas.js)
- [`routes/*.js`](../routes/) - 添加验证中间件

---

### Sprint 5: 日志与监控（优先级：🟢 低）
**工期**: 2个工作日  
**目标**: 优化日志记录和性能监控

#### 5.1 日志级别优化
**当前问题**:
- 调试日志过多，影响性能
- 缺少结构化日志
- 日志文件无轮转机制

**改进方案**:
```javascript
// src/utils/logger.js - 增强
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // 错误日志
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d'
    }),
    
    // 综合日志
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '7d'
    })
  ]
});

// 开发环境添加控制台输出
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// 性能日志
export const logPerformance = (operation, duration, metadata = {}) => {
  logger.info({
    type: 'performance',
    operation,
    duration,
    ...metadata
  });
};

// 业务日志
export const logBusiness = (event, data = {}) => {
  logger.info({
    type: 'business',
    event,
    ...data
  });
};
```

**依赖**:
```bash
npm install winston-daily-rotate-file
```

**验收标准**:
- [ ] 生产环境日志减少 60%
- [ ] 结构化 JSON 日志
- [ ] 日志轮转机制（按天，保留7天）
- [ ] 性能日志分析工具

**文件变更**:
- [`src/utils/logger.js`](../src/utils/logger.js) - 增强

---

### Sprint 6: 测试与文档（优先级：🟢 低）
**工期**: 5个工作日  
**目标**: 完善测试覆盖率和文档

#### 6.1 单元测试覆盖率提升
**当前状态**: 部分模块有测试（extractors、database、browser）

**目标**: 总体覆盖率 >80%

**需要添加测试**:
```
tests/
├── routes/
│   ├── providers.test.js
│   ├── api_keys.test.js
│   ├── chat.test.js
│   └── browser.test.js
├── services/
│   ├── cookieManager.test.js
│   ├── requestManager.test.js
│   └── webConfig.test.js
├── utils/
│   ├── logger.test.js
│   ├── errorHandler.test.js
│   └── encryption.test.js
└── integration/
    ├── api-flow.test.js
    └── browser-flow.test.js
```

**测试示例**:
```javascript
// tests/services/cookieManager.test.js
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { cookieManager } from '../../src/services/cookieManager.js';
import fs from 'fs/promises';

describe('CookieManager', () => {
  beforeEach(async () => {
    await cookieManager.init();
  });
  
  afterEach(async () => {
    // 清理测试数据
    const domains = await cookieManager.listDomains();
    for (const domain of domains) {
      await cookieManager.deleteCookies(domain);
    }
  });
  
  it('应该能够保存cookies', async () => {
    const cookies = [
      { name: 'test', value: 'value', domain: 'example.com' }
    ];
    
    await cookieManager.saveCookies('example.com', cookies);
    const loaded = await cookieManager.loadCookies('example.com');
    
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('test');
  });
  
  it('应该过滤过期的cookies', async () => {
    const cookies = [
      { name: 'valid', value: 'v1', expires: Date.now() + 86400000 },
      { name: 'expired', value: 'v2', expires: Date.now() - 1000 }
    ];
    
    await cookieManager.saveCookies('test.com', cookies);
    const loaded = await cookieManager.loadCookies('test.com');
    
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('valid');
  });
});
```

**验收标准**:
- [ ] 代码覆盖率 >80%
- [ ] 所有关键路径有测试
- [ ] CI/CD 集成测试
- [ ] 性能测试基准

---

#### 6.2 API 文档生成
**工具**: Swagger/OpenAPI

**依赖**:
```bash
npm install swagger-jsdoc swagger-ui-express
```

**实现**:
```javascript
// swagger.js
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API-Tools API Documentation',
      version: '2.0.0',
      description: 'API 密钥管理和浏览器自动化平台',
      contact: {
        name: 'API Support',
        email: 'support@api-tools.com'
      }
    },
    servers: [
      { url: 'http://localhost:3000', description: '开发环境' },
      { url: 'https://api.production.com', description: '生产环境' }
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key'
        }
      }
    },
    security: [{
      ApiKeyAuth: []
    }]
  },
  apis: ['./routes/*.js', './src/validation/schemas.js']
};

export const specs = swaggerJsdoc(options);

export const setupSwagger = (app) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }'
  }));
};
```

**路由注释示例**:
```javascript
/**
 * @swagger
 * /api/providers:
 *   get:
 *     summary: 获取所有提供商
 *     tags: [Providers]
 *     responses:
 *       200:
 *         description: 提供商列表
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Provider'
 *   post:
 *     summary: 创建新提供商
 *     tags: [Providers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Provider'
 *     responses:
 *       201:
 *         description: 提供商创建成功
 *       400:
 *         description: 请求验证失败
 * 
 * components:
 *   schemas:
 *     Provider:
 *       type: object
 *       required:
 *         - name
 *         - url
 *       properties:
 *         id:
 *           type: integer
 *           description: 提供商ID
 *         name:
 *           type: string
 *           description: 提供商名称
 *         url:
 *           type: string
 *           format: uri
 *           description: API端点URL
 *         website:
 *           type: string
 *           format: uri
 *           description: 官方网站
 */
```

**验收标准**:
- [ ] 所有 API 端点有文档
- [ ] Swagger UI 可访问 (/api-docs)
- [ ] 包含请求/响应示例
- [ ] 添加认证说明

---

#### 6.3 开发者文档完善

**1. ARCHITECTURE.md** - 系统架构说明
**2. CONTRIBUTING.md** - 贡献指南
**3. DEPLOYMENT.md** - 部署指南
**4. TROUBLESHOOTING.md** - 故障排除

**验收标准**:
- [ ] 所有文档已创建
- [ ] 文档审阅通过
- [ ] README 更新
- [ ] 添加架构图和流程图

---

## 📅 Sprint 执行顺序

```
Sprint 0 (已完成) - 基础修复
    ↓
Sprint 1 (5天) - 安全与稳定性 ⚠️ 最高优先级
    ↓
Sprint 2 (3天) - 性能优化
    ↓
Sprint 3 (5天) - 架构改进
    ↓
Sprint 4 (3天) - 输入验证
    ↓
Sprint 5 (2天) - 日志与监控
    ↓
Sprint 6 (5天) - 测试与文档
```

**总工期**: 约 23 个工作日（~1个月）

---

## 🔄 每个 Sprint 的标准流程

### 1. Sprint 计划会议（1小时）
- 审查需求
- 拆分任务
- 估算工作量
- 分配任务

### 2. 开发阶段
- 每日站会（15分钟）
- 结对编程（关键模块）
- 代码审查（所有 PR）

### 3. 测试阶段
- 单元测试编写
- 集成测试验证
- 手动测试
- 性能测试

### 4. Sprint 评审（1小时）
- 演示完成功能
- 收集反馈
- 更新待办事项

### 5. Sprint 回顾（30分钟）
- 讨论改进点
- 更新流程
- 文档更新

---

## ✅ 质量保证标准

### 代码质量
- [ ] ESLint 无错误
- [ ] TypeScript 类型检查通过
- [ ] 代码审查通过
- [ ] 符合编码规范

### 测试要求
- [ ] 单元测试覆盖率 >80%
- [ ] 集成测试通过
- [ ] 性能测试达标
- [ ] 安全扫描无高危问题

### 文档要求
- [ ] API 文档完整
- [ ] 代码注释充分
- [ ] README 更新
- [ ] 变更日志记录

---

## ⚠️ 风险管理

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 重构破坏现有功能 | 高 | 中 | 全面测试、分阶段发布 |
| 性能下降 | 中 | 低 | 性能基准测试、监控 |
| 依赖冲突 | 低 | 中 | 依赖锁定、兼容性测试 |
| 时间超期 | 中 | 中 | 每周评审、及时调整 |

---

## 🎯 成功指标

### Sprint 1 完成后
- ✅ 无已知安全漏洞
- ✅ API 密钥管理性能提升 50%
- ✅ Cookie 加密存储

### Sprint 2 完成后
- ✅ 并发请求支持（5个并发）
- ✅ QPS 提升 3 倍
- ✅ 内存泄漏修复

### Sprint 3 完成后
- ✅ 代码重复率降低 40%
- ✅ 单一配置入口
- ✅ 架构文档完成

### Sprint 4 完成后
- ✅ 所有输入验证
- ✅ 参数校验覆盖率 100%

### Sprint 5 完成后
- ✅ 生产日志减少 60%
- ✅ 结构化日志
- ✅ 监控面板上线

### Sprint 6 完成后
- ✅ 测试覆盖率 >80%
- ✅ API 文档完整
- ✅ 所有文档审阅通过

---

## 📦 版本发布计划

### v1.1.0 - Sprint 1 完成后
**发布日期**: Sprint 1 结束后 3 天  
**主要特性**:
- API 密钥管理优化
- Cookie 安全性加强
- 错误处理完善

### v1.2.0 - Sprint 2 完成后
**发布日期**: Sprint 2 结束后 3 天  
**主要特性**:
- 并发请求支持
- 浏览器实例管理优化
- 性能提升

### v1.3.0 - Sprint 3-4 完成后
**发布日期**: Sprint 4 结束后 5 天  
**主要特性**:
- 架构重构
- 输入验证
- 配置管理统一

### v2.0.0 - Sprint 6 完成后
**发布日期**: Sprint 6 结束后 5 天  
**主要特性**:
- 完整测试覆盖
- API 文档
- 生产就绪

---

## 📊 技术债务跟踪

### 当前技术债务清单
1. ❌ 密钥轮换算法复杂度高
2. ❌ Cookie 明文存储
3. ❌ 缺少请求并发控制
4. ❌ 错误处理不统一
5. ❌ 配置分散多处
6. ❌ 缺少输入验证
7. ❌ 日志过度输出
8. ❌ 测试覆盖率不足

### Sprint 后预期状态
- Sprint 1 完成: 解决 1, 2, 4
- Sprint 2 完成: 解决 3
- Sprint 3 完成: 解决 5
- Sprint 4 完成: 解决 6
- Sprint 5 完成: 解决 7
- Sprint 6 完成: 解决 8

---

## 📈 性能基准

```
基准指标（当前）:
- QPS: ~10 请求/秒
- 平均响应时间: 150ms
- 内存占用: 200MB
- 浏览器实例数: 3

目标指标（Sprint 2 后）:
- QPS: ~30 请求/秒
- 平均响应时间: 100ms
- 内存占用: <250MB
- 浏览器实例数: 5（可配置）
```

---

## 📝 结语

本重构计划采用敏捷开发方法，分 6 个 Sprint 逐步优化系统。每个 Sprint 都有明确的目标、验收标准和测试要求。

**关键原则**:
1. 🔒 **安全第一** - Sprint 1 优先解决安全问题
2. 📈 **渐进增强** - 小步快跑，持续改进
3. ✅ **质量保证** - 每个 Sprint 都要充分测试
4. 📚 **文档先行** - 代码和文档同步更新

**预期成果**:
- 更安全的系统
- 更好的性能
- 更高的代码质量
- 更完善的文档

---

**文档版本**: v1.0  
**创建日期**: 2025-12-29  
**最后更新**: 2025-12-29  
**状态**: ✅ 已批准，待执行
