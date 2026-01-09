# 资源管理文档

## 概述

本项目实现了完善的资源管理机制，包括浏览器实例池和数据库连接池，以提高资源利用率和系统性能。

## 浏览器实例池

### 功能特性

浏览器实例池管理器（`src/services/browser/pool.js`）提供以下功能：

- **实例复用**：复用空闲的浏览器实例，减少创建和销毁开销
- **自动清理**：自动清理超时的空闲实例，释放系统资源
- **连接跟踪**：跟踪每个实例的获取和释放状态
- **状态监控**：提供池状态查询接口，便于监控和调试

### 使用方法

```javascript
import browserPool from './src/services/browser/pool.js';

// 获取浏览器实例
const { id, browser } = await browserPool.acquire();

// 使用浏览器实例
const page = await browser.newPage();

// 释放浏览器实例
browserPool.release(id);
```

### 配置选项

```javascript
const pool = new BrowserPool({
  maxInstances: 3,        // 最大实例数
  idleTimeout: 300000,     // 空闲超时（5分钟）
  acquireTimeout: 5000      // 获取超时（5秒）
});
```

### 池状态

```javascript
const status = browserPool.getStatus();
console.log(status);
/*
{
  total: 3,        // 总实例数
  active: 1,       // 活跃实例数
  idle: 2,         // 空闲实例数
  max: 3,          // 最大实例数
  instances: [...]   // 实例详情列表
}
*/
```

### 清理机制

浏览器池每分钟检查一次空闲实例：

- 检查每个实例的最后使用时间
- 超过`idleTimeout`的实例会被自动清理
- 保留至少30%的最小实例数，确保基本可用性

## 数据库连接池

### 功能特性

数据库连接池管理器（`src/services/database/pool.js`）提供以下功能：

- **连接复用**：复用空闲的数据库连接，减少创建和销毁开销
- **自动清理**：自动清理超时的空闲连接，释放系统资源
- **连接跟踪**：跟踪每个连接的获取和释放状态
- **状态监控**：提供池状态查询接口，便于监控和调试
- **超时控制**：支持获取超时和空闲超时配置

### 使用方法

```javascript
import { DatabasePool } from './src/services/database/pool.js';

const dbPool = new DatabasePool('./ai_models.db', {
  maxConnections: 10,
  idleTimeout: 300000,
  acquireTimeout: 5000
});

// 获取数据库连接
const { id, db } = await dbPool.acquire();

// 使用数据库连接
db.all('SELECT * FROM providers', (err, rows) => {
  // 处理查询结果
});

// 释放数据库连接
dbPool.release(id);
```

### 配置选项

```javascript
const pool = new DatabasePool(dbPath, {
  maxConnections: 10,       // 最大连接数
  idleTimeout: 300000,       // 空闲超时（5分钟）
  acquireTimeout: 5000        // 获取超时（5秒）
});
```

### 池状态

```javascript
const status = dbPool.getStatus();
console.log(status);
/*
{
  total: 10,       // 总连接数
  active: 3,       // 活跃连接数
  idle: 7,         // 空闲连接数
  max: 10,         // 最大连接数
  connections: [...] // 连接详情列表
}
*/
```

### 清理机制

数据库连接池每分钟检查一次空闲连接：

- 检查每个连接的最后使用时间
- 超过`idleTimeout`的连接会被自动清理
- 保留至少30%的最小连接数，确保基本可用性

## 内存管理

### 功能特性

内存管理模块（`memory_manager.js`）提供以下功能：

- **自动清理**：定期执行内存清理，防止内存泄漏
- **实时监控**：监控内存使用情况，及时发现异常
- **趋势分析**：分析内存使用趋势，预测潜在问题
- **警告机制**：内存使用过高时发出警告

### 使用方法

```javascript
import memoryManager from './memory_manager.js';

// 启动自动清理（每30秒）
memoryManager.startAutoCleanup(30000);

// 获取实时内存使用情况
const usage = memoryManager.getRealtimeMemoryUsage();
console.log(usage);
/*
{
  current: { rss, heapTotal, heapUsed, external, arrayBuffers },
  formatted: { rss, heapTotal, heapUsed, external, arrayBuffers },
  change: { rss, heapTotal, heapUsed, external, timeDiff },
  timestamp: 1234567890
}
*/

// 停止自动清理
memoryManager.stopAutoCleanup();
```

### 清理机制

内存管理器支持以下清理策略：

1. **自动垃圾回收**：调用`global.gc()`执行垃圾回收（如果可用）
2. **延迟检查**：在清理后延迟检查，确保垃圾回收完成
3. **效果评估**：比较清理前后的内存使用，评估清理效果
4. **趋势分析**：计算内存变化速率，预测潜在问题

### 警告阈值

当堆内存使用超过500MB时，会发出警告：

```
⚠️ 内存使用过高 (xxx.xx MB)，建议检查内存泄漏
```

## 最佳实践

### 浏览器实例管理

1. **及时释放实例**：使用完浏览器实例后立即释放
2. **合理配置池大小**：根据实际负载调整`maxInstances`
3. **监控池状态**：定期检查池状态，确保健康运行
4. **处理异常**：捕获并处理浏览器实例异常，避免资源泄漏

### 数据库连接管理

1. **及时释放连接**：使用完数据库连接后立即释放
2. **合理配置池大小**：根据实际负载调整`maxConnections`
3. **监控池状态**：定期检查池状态，确保健康运行
4. **处理异常**：捕获并处理数据库连接异常，避免资源泄漏

### 内存管理

1. **定期监控**：定期检查内存使用情况
2. **及时清理**：发现内存泄漏时及时处理
3. **优化代码**：避免不必要的内存占用
4. **使用缓存**：合理使用缓存，减少重复计算

## 故障排除

### 浏览器实例问题

**问题**：浏览器实例无法获取
- 检查浏览器池是否已满
- 检查是否有空闲实例
- 检查获取超时设置

**问题**：浏览器实例未释放
- 检查是否调用了`release`方法
- 检查是否有异常导致释放失败
- 检查清理任务是否正常运行

### 数据库连接问题

**问题**：数据库连接无法获取
- 检查连接池是否已满
- 检查是否有空闲连接
- 检查获取超时设置

**问题**：数据库连接未释放
- 检查是否调用了`release`方法
- 检查是否有异常导致释放失败
- 检查清理任务是否正常运行

### 内存问题

**问题**：内存使用过高
- 检查是否有内存泄漏
- 检查清理任务是否正常运行
- 检查缓存设置是否合理

**问题**：内存清理无效
- 检查是否启用了`global.gc()`
- 检查清理间隔是否合理
- 检查是否有大量缓存未清理
