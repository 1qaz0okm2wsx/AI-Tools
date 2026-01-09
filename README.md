# AI模型管理工具 + Web-to-API

一个强大的AI服务管理系统，集成了提供商管理、模型检测、OpenAI兼容API代理，以及Web-to-API浏览器自动化功能。

## ✨ 核心特性

### 🏢 提供商管理
- 添加、编辑、删除AI服务提供商
- 支持多个API密钥轮换
- 自动检测可用模型

### 🤖 模型管理
- 自动检测各提供商的可用模型
- 支持模型分类和能力标签
- 详细的模型信息展示

### 🔌 OpenAI兼容API
- 完全兼容OpenAI API格式
- 支持流式和非流式响应
- 自动路由到对应提供商

### 🌐 Web-to-API 浏览器自动化 (新功能!)
- 将任意AI Web界面转换为OpenAI兼容API
- 支持多个主流AI网站：
  - ChatGPT (chatgpt.com)
  - Claude (claude.ai)
  - Google AI Studio (aistudio.google.com)
  - Grok (grok.com)
  - DeepSeek (chat.deepseek.com)
  - 豆包 (www.doubao.com)
  - LM Arena (lmarena.ai)
- 自动Cookie管理和登录状态检测
- 智能错误恢复和重试机制

## 📦 快速开始

### 1. 环境要求

- Node.js 16+
- Chrome 浏览器（用于Web-to-API功能）

### 2. 安装依赖

```bash
cd API-Tools
npm install
```

### 3. 配置环境变量

编辑 `.env` 文件：

```env
# 服务器端口
PORT=3000

# 数据库配置
DB_PATH=./ai_models.db

# API调用超时时间（毫秒）
API_TIMEOUT=10000

# 浏览器自动化配置
BROWSER_ENABLED=true
BROWSER_PORT=9222
DEFAULT_SITE=chatgpt.com

# 日志配置
LOG_LEVEL=info
```

### 4. 启动Chrome（用于浏览器自动化）

如果启用了浏览器自动化功能：

```bash
# Windows
chrome.exe --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\chrome-debug"

# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="~/chrome-debug"

# Linux
google-chrome --remote-debugging-port=9222 --user-data-dir="~/chrome-debug"
```

### 5. 启动服务

```bash
npm start
```

## 📡 API 接口

### OpenAI兼容接口

#### 聊天补全（通过提供商）
```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": true
  }'
```

#### 聊天补全（通过浏览器自动化）
```bash
curl http://localhost:3000/v1/browser/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "web-browser",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": true
  }'
```

#### 模型列表
```bash
# 提供商模型
curl http://localhost:3000/v1/models

# 浏览器模型
curl http://localhost:3000/v1/browser/models
```

### 提供商管理API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/` | GET | 首页 - 显示所有提供商 |
| `/add-provider` | GET/POST | 添加新提供商 |
| `/edit-provider/:id` | GET/POST | 编辑提供商 |
| `/delete-provider/:id` | POST | 删除提供商 |
| `/detect-models/:id` | POST | 检测提供商模型 |

### 浏览器自动化API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/v1/browser/chat/completions` | POST | 浏览器聊天接口 |
| `/v1/browser/health` | GET | 浏览器健康状态 |
| `/v1/browser/models` | GET | 可用网站模型列表 |
| `/api/browser/config` | GET/POST | 站点配置管理 |
| `/api/browser/open` | POST | 打开指定网站 |
| `/api/browser/cookies` | GET | 列出所有Cookie |
| `/api/browser/cookies/:domain` | GET/DELETE | 管理指定域名Cookie |
| `/api/browser/cookies/save` | POST | 保存当前页面Cookie |

### 健康检查

```bash
curl http://localhost:3000/health
```

响应示例：
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "database": {
    "status": "connected",
    "path": "./ai_models.db"
  },
  "memory": {
    "used": 50.5,
    "total": 100
  },
  "version": "2.0.0",
  "features": {
    "modelManagement": true,
    "browserAutomation": true
  },
  "browser": {
    "status": "healthy",
    "connected": true,
    "url": "https://chatgpt.com",
    "isLoggedIn": true
  }
}
```

## 🎨 添加自定义网站

在 `config/sites.json` 中添加：

```json
{
  "your-site.com": {
    "url": "https://your-site.com",
    "selectors": {
      "input_box": "textarea[placeholder*='输入']",
      "send_btn": "button[type='submit']",
      "result_container": ".message-container"
    },
    "workflow": [
      {"action": "CLICK", "target": "input_box", "optional": false},
      {"action": "FILL_INPUT", "target": "input_box"},
      {"action": "CLICK", "target": "send_btn"},
      {"action": "STREAM_WAIT", "target": "result_container"}
    ],
    "stealth": false
  }
}
```

## 📁 项目结构

```
API-Tools/
├── index.js                    # 主入口文件
├── package.json                # 项目配置
├── .env                        # 环境变量
├── ai_models.db               # SQLite数据库
├── config/
│   ├── sites.json             # 网站配置
│   └── browser_config.json    # 浏览器常量配置
├── routes/
│   ├── index.js               # 主页路由
│   ├── providers.js           # 提供商管理
│   ├── chat.js                # OpenAI代理
│   ├── browser.js             # 浏览器自动化API
│   └── ...                    # 其他路由
├── src/
│   ├── services/
│   │   ├── browser/           # 浏览器服务
│   │   ├── extractors/        # 内容提取器
│   │   ├── streamMonitor/     # 流式监听
│   │   ├── workflow/          # 工作流执行
│   │   ├── cookieManager.js   # Cookie管理
│   │   └── webConfig.js       # Web配置服务
│   └── utils/
│       ├── logger.js          # 日志工具
│       └── errorHandler.js    # 错误处理
├── views/
│   ├── index.ejs              # 首页
│   ├── browser.ejs            # 浏览器管理页面
│   └── ...                    # 其他视图
└── public/
    └── css/
        └── style.css          # 样式
```

## 🔧 开发说明

### 日志级别

在 `.env` 中设置：

```env
LOG_LEVEL=info  # debug, info, warn, error
```

### 禁用浏览器功能

如果不需要浏览器自动化功能：

```env
BROWSER_ENABLED=false
```

## ⚠️ 注意事项

1. **Chrome必须以远程调试模式启动**才能使用浏览器自动化功能
2. **首次使用需要手动登录一次**目标AI网站
3. **Cookie文件包含敏感信息**，请注意安全
4. **遵守目标网站的服务条款**
5. **请勿滥用，合理控制请求频率**

## 🔒 安全建议

- 不要将 `cookies/` 目录提交到版本控制
- 妥善保管 Cookie 文件和数据库
- 定期更新依赖包
- 仅在可信环境中运行

## 📝 更新日志

### v2.0.0 (最新)
- ✅ 集成 Web-to-API 浏览器自动化功能
- ✅ 添加浏览器管理界面
- ✅ 支持多个AI网站自动化
- ✅ 智能Cookie管理和登录检测
- ✅ 统一的OpenAI兼容API

### v1.0.0
- AI服务提供商管理
- 模型自动检测
- OpenAI API代理
- 操作日志记录

## 📄 许可证

MIT

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！
