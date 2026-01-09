# 配置管理文档

## 概述

本项目实现了统一的配置管理系统，支持多环境配置、环境变量覆盖和配置验证，避免硬编码配置。

## 配置结构

### 主配置文件

配置文件位于`config/`目录：

- `app.json` - 默认配置（开发环境）
- `app.production.json` - 生产环境配置
- `app.test.json` - 测试环境配置

### 配置层次

配置按以下优先级加载（从低到高）：

1. 默认配置（代码中的DEFAULT_CONFIG）
2. 环境配置文件（config/app.{ENV}.json）
3. 环境变量（process.env）

## 配置项

### 数据库配置

```json
{
  "database": {
    "path": "./ai_models.db",
    "pool": {
      "maxConnections": 10,
      "idleTimeout": 300000,
      "acquireTimeout": 5000
    }
  }
}
```

**配置项说明**：
- `path`: 数据库文件路径
- `maxConnections`: 连接池最大连接数
- `idleTimeout`: 空闲连接超时（毫秒）
- `acquireTimeout`: 获取连接超时（毫秒）

**环境变量覆盖**：
- `DB_PATH`: 覆盖数据库路径
- `DB_POOL_MAX`: 覆盖最大连接数
- `DB_POOL_IDLE_TIMEOUT`: 覆盖空闲超时

### 浏览器配置

```json
{
  "browser": {
    "pool": {
      "maxInstances": 3,
      "idleTimeout": 300000,
      "acquireTimeout": 5000
    },
    "constants": {
      "DEFAULT_PORT": 9222,
      "CONNECTION_TIMEOUT": 10,
      "STEALTH_DELAY_MIN": 0.1,
      "STEALTH_DELAY_MAX": 0.3,
      "ACTION_DELAY_MIN": 0.15,
      "ACTION_DELAY_MAX": 0.3,
      "DEFAULT_ELEMENT_TIMEOUT": 3,
      "FALLBACK_ELEMENT_TIMEOUT": 1,
      "ELEMENT_CACHE_MAX_AGE": 5.0,
      "STREAM_CHECK_INTERVAL_MIN": 0.1,
      "STREAM_CHECK_INTERVAL_MAX": 1.0,
      "STREAM_CHECK_INTERVAL_DEFAULT": 0.3,
      "STREAM_SILENCE_THRESHOLD": 6.0,
      "STREAM_MAX_TIMEOUT": 600,
      "STREAM_INITIAL_WAIT": 180,
      "STREAM_RERENDER_WAIT": 0.5,
      "STREAM_CONTENT_SHRINK_TOLERANCE": 3,
      "STREAM_MIN_VALID_LENGTH": 10,
      "STREAM_STABLE_COUNT_THRESHOLD": 5,
      "STREAM_SILENCE_THRESHOLD_FALLBACK": 10.0,
      "MAX_MESSAGE_LENGTH": 100000,
      "MAX_MESSAGES_COUNT": 100,
      "STREAM_INITIAL_ELEMENT_WAIT": 10,
      "STREAM_MAX_ABNORMAL_COUNT": 5,
      "STREAM_MAX_ELEMENT_MISSING": 10,
      "STREAM_CONTENT_SHRINK_THRESHOLD": 0.3,
      "STREAM_USER_MSG_WAIT": 1.5,
      "STREAM_PRE_BASELINE_DELAY": 0.3
    }
  }
}
```

**配置项说明**：
- `maxInstances`: 浏览器实例池最大实例数
- `idleTimeout`: 空闲实例超时（毫秒）
- `acquireTimeout`: 获取实例超时（毫秒）
- `constants`: 浏览器操作常量

**环境变量覆盖**：
- `BROWSER_PORT`: 覆盖默认端口
- `BROWSER_POOL_MAX`: 覆盖最大实例数
- `BROWSER_POOL_IDLE_TIMEOUT`: 覆盖空闲超时

### 服务器配置

```json
{
  "server": {
    "port": 3000,
    "host": "0.0.0.0"
  }
}
```

**配置项说明**：
- `port`: 服务器监听端口
- `host`: 服务器监听地址

**环境变量覆盖**：
- `PORT`: 覆盖服务器端口
- `HOST`: 覆盖服务器地址

### 内存管理配置

```json
{
  "memory": {
    "autoCleanup": true,
    "cleanupInterval": 30000,
    "warningThreshold": 500,
    "gcEnabled": false
  }
}
```

**配置项说明**：
- `autoCleanup`: 是否启用自动清理
- `cleanupInterval`: 清理间隔（毫秒）
- `warningThreshold`: 内存警告阈值（MB）
- `gcEnabled`: 是否启用手动垃圾回收

**环境变量覆盖**：
- `MEMORY_CLEANUP_INTERVAL`: 覆盖清理间隔
- `MEMORY_WARNING_THRESHOLD`: 覆盖警告阈值

### 日志配置

```json
{
  "logging": {
    "level": "info",
    "maxFiles": 10,
    "maxSize": "10m",
    "directory": "./logs"
  }
}
```

**配置项说明**：
- `level`: 日志级别（debug, info, warn, error）
- `maxFiles`: 最大日志文件数
- `maxSize`: 单个日志文件最大大小
- `directory`: 日志文件目录

**环境变量覆盖**：
- `LOG_LEVEL`: 覆盖日志级别

### API配置

```json
{
  "api": {
    "timeout": 10000,
    "maxRetries": 3,
    "retryDelay": 1000
  }
}
```

**配置项说明**：
- `timeout`: API请求超时（毫秒）
- `maxRetries`: 最大重试次数
- `retryDelay`: 重试延迟（毫秒）

**环境变量覆盖**：
- `API_TIMEOUT`: 覆盖API超时
- `API_MAX_RETRIES`: 覆盖最大重试次数

## 使用方法

### 基本使用

```javascript
import configService from './src/services/config/index.js';

// 加载配置
await configService.load();

// 验证配置
configService.validate();

// 获取配置值
const dbPath = configService.get('database.path');
const maxConnections = configService.get('database.pool.maxConnections');

// 设置配置值
configService.set('database.pool.maxConnections', 20);

// 保存配置
await configService.save();
```

### 获取特定配置

```javascript
// 获取数据库配置
const dbConfig = configService.getDatabaseConfig();

// 获取浏览器配置
const browserConfig = configService.getBrowserConfig();

// 获取服务器配置
const serverConfig = configService.getServerConfig();

// 获取内存配置
const memoryConfig = configService.getMemoryConfig();

// 获取日志配置
const loggingConfig = configService.getLoggingConfig();

// 获取API配置
const apiConfig = configService.getApiConfig();
```

## 配置验证

配置服务会自动验证配置的有效性：

- 数据库路径不能为空
- 连接池最大连接数必须大于0
- 连接池空闲超时必须大于1秒
- 浏览器实例池最大实例数必须大于0
- 浏览器实例池空闲超时必须大于1秒
- 服务器端口必须在1-65535之间
- 内存警告阈值必须大于100MB

如果验证失败，会抛出错误并阻止应用启动。

## 最佳实践

### 1. 环境分离

为不同环境创建不同的配置文件：

- `app.json` - 开发环境
- `app.production.json` - 生产环境
- `app.test.json` - 测试环境

通过`NODE_ENV`环境变量指定环境：

```bash
NODE_ENV=production node index.js
```

### 2. 敏感信息管理

不要将敏感信息（如API密钥、数据库密码）直接写入配置文件，而是使用环境变量：

```bash
# .env文件
DB_PASSWORD=your_password
API_KEY=your_api_key
```

### 3. 配置验证

在应用启动时验证配置，确保所有必需的配置项都存在且有效。

### 4. 配置文档

为每个配置项添加详细的文档说明，包括：
- 配置项名称
- 数据类型
- 默认值
- 有效范围
- 环境变量覆盖方式

### 5. 配置版本控制

将配置文件纳入版本控制，便于追踪配置变更历史。

## 故障排除

### 配置未加载

**问题**：配置未正确加载
- 检查配置文件路径是否正确
- 检查配置文件格式是否正确（JSON）
- 检查文件权限是否正确
- 查看日志中的配置加载错误

### 配置验证失败

**问题**：配置验证失败
- 检查配置项是否完整
- 检查配置值是否在有效范围内
- 检查配置项类型是否正确
- 查看日志中的验证错误详情

### 环境变量未生效

**问题**：环境变量未覆盖配置
- 检查环境变量名称是否正确
- 检查环境变量是否已设置
- 检查环境变量值的类型是否正确
- 检查环境变量是否在正确的时机设置

### 配置热更新

**问题**：配置更新未生效
- 检查是否调用了`save()`方法
- 检查是否有权限写入配置文件
- 检查配置文件是否被其他进程锁定
- 考虑重启应用以应用新配置
