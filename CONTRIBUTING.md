# 贡献指南

感谢您对 AI Model Manager + Web-to-API 项目的关注！我们欢迎任何形式的贡献。

## 📋 目录

- [行为准则](#行为准则)
- [如何贡献](#如何贡献)
- [开发环境设置](#开发环境设置)
- [代码规范](#代码规范)
- [提交 Pull Request](#提交-pull-request)
- [报告问题](#报告问题)

## 🤝 行为准则

- 尊重所有贡献者
- 使用清晰和专业的语言
- 接受建设性的批评
- 关注对社区最有利的事情

## 🚀 如何贡献

### 报告 Bug

在提交 bug 报告之前，请检查：

1. 是否已有其他人报告了相同的问题
2. 问题是否可以在最新版本中复现
3. 提供详细的重现步骤

报告 Bug 时，请包含：

- 清晰的标题和描述
- 重现步骤
- 预期行为和实际行为
- 环境信息（Node.js 版本、操作系统等）
- 相关的日志或错误信息

### 提出新功能

在提出新功能之前，请：

1. 检查是否已有相关的 Issue 或 PR
2. 清晰地描述新功能的目的和用例
3. 考虑实现复杂度和维护成本

### 提交代码

我们欢迎代码贡献！请遵循以下步骤：

## 💻 开发环境设置

### 前置要求

- Node.js 16 或更高版本
- npm 或 yarn
- Git

### 安装依赖

```bash
# 克隆仓库
git clone https://github.com/1qaz0okm2wsx/AI-Tools.git
cd AI-Tools

# 安装依赖
npm install
```

### 运行项目

```bash
# 开发模式（自动重启）
npm run dev

# 生产模式
npm start
```

### 运行测试

```bash
# 运行所有测试
npm test

# 监听模式
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

### 代码检查和格式化

```bash
# 运行 ESLint
npm run lint

# 格式化代码
npm run format

# 检查代码格式
npm run format:check
```

## 📝 代码规范

### JavaScript/Node.js

- 使用 ES6+ 语法
- 使用 ESM 模块（import/export）
- 遵循项目现有的代码风格
- 使用有意义的变量和函数名
- 添加必要的注释（特别是复杂逻辑）

### 文件规范

- 单个文件不超过 750 行
- 路由文件不超过 10KB
- 核心模块文件不超过 50KB
- 前端模板文件不超过 40KB

### 提交信息规范

使用清晰的提交信息格式：

```
<type>(<scope>): <subject>

<body>

<footer>
```

类型（type）：
- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建/工具链相关

示例：
```
feat(browser): 添加新的 AI 网站支持

- 添加对 example.com 的支持
- 实现自定义选择器配置
- 更新文档

Closes #123
```

## 🔄 提交 Pull Request

### PR 流程

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/your-feature-name`
3. 提交更改：`git commit -m 'feat: add some feature'`
4. 推送到分支：`git push origin feature/your-feature-name`
5. 提交 Pull Request

### PR 要求

- 通过所有测试：`npm test`
- 通过代码检查：`npm run lint`
- 代码格式正确：`npm run format:check`
- 添加必要的测试
- 更新相关文档
- 清晰描述 PR 的目的和更改内容

### PR 模板

```markdown
## 描述
简要描述此 PR 的目的

## 更改类型
- [ ] 新功能
- [ ] Bug 修复
- [ ] 文档更新
- [ ] 代码重构
- [ ] 性能优化
- [ ] 其他

## 测试
- [ ] 已添加新测试
- [ ] 所有测试通过
- [ ] 已手动测试

## 检查清单
- [ ] 代码符合项目规范
- [ ] 已通过 ESLint 检查
- [ ] 已通过 Prettier 格式化
- [ ] 已更新相关文档
- [ ] 提交信息清晰明确

## 相关 Issue
Closes #(issue number)
```

## 🐛 报告问题

### Issue 模板

```markdown
## 问题描述
清晰简洁地描述问题

## 重现步骤
1. 执行操作 '...'
2. 点击 '....'
3. 滚动到 '....'
4. 看到错误

## 预期行为
描述您期望发生的事情

## 实际行为
描述实际发生的事情

## 环境信息
- OS: [例如 Windows 11, macOS 13, Ubuntu 22.04]
- Node.js 版本: [例如 18.17.0]
- 项目版本: [例如 2.0.0]

## 日志/截图
如果适用，添加相关的日志或截图

## 附加信息
添加任何其他有助于解决问题的信息
```

## 📚 资源

- [项目文档](./README.md)
- [开发文档](./开发文档.md)
- [测试指南](./TESTING.md)
- [浏览器自动化文档](./docs/browser-automation.md)

## 💬 联系方式

如有疑问，请：

1. 查看 [Issues](https://github.com/1qaz0okm2wsx/AI-Tools/issues)
2. 创建新的 Issue 提问
3. 参与 [Discussions](https://github.com/1qaz0okm2wsx/AI-Tools/discussions)

---

再次感谢您的贡献！🎉
