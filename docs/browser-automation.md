# 浏览器自动化模块文档

## 概述

浏览器自动化模块提供了将AI网站转换为OpenAI兼容API的功能。该模块采用模块化设计，分为提取器、工作流和流监控三个主要部分。

## 架构

### 提取器模块 (src/services/extractors/)

提取器负责从网页中提取AI响应内容。

#### 基础提取器 (base.js)

```javascript
export class BaseExtractor {
  constructor() {
    this.id = 'base';
    this.name = 'Base Extractor';
  }

  async extract(page, selector) {
    throw new Error('extract 方法必须被子类实现');
  }

  async extractMultiple(page, selector) {
    throw new Error('extractMultiple 方法必须被子类实现');
  }
}
```

所有提取器都应继承自`BaseExtractor`，并实现以下方法：
- `getId()`: 返回提取器的唯一标识符
- `getName()`: 返回提取器的名称
- `extract(page, selector)`: 提取单个元素的内容
- `extractMultiple(page, selector)`: 提取多个元素的内容

#### DOM提取器 (dom.js)

使用DOM API提取内容，适用于大多数现代网站。

```javascript
export class DOMExtractor extends BaseExtractor {
  constructor() {
    super();
    this.id = 'dom_mode';
    this.name = 'DOM Mode Extractor';
  }

  async extract(page, selector) {
    const result = await page.evaluate(sel => {
      const element = document.querySelector(sel);
      if (!element) {
        return { success: false, text: '', error: 'Element not found' };
      }
      return {
        success: true,
        text: element.innerText || element.textContent || '',
        html: element.outerHTML
      };
    }, selector);

    if (!result.success) {
      logger.warn(`[DOM] 提取失败: ${result.error}`);
      return null;
    }

    return result.text;
  }
}
```

#### 深度浏览器提取器 (deep.js)

使用深度遍历DOM树提取内容，适用于复杂的页面结构。

```javascript
export class DeepBrowserExtractor extends BaseExtractor {
  constructor() {
    super();
    this.id = 'deep_mode';
    this.name = 'Deep Browser Extractor';
  }

  async extract(page, selector) {
    const result = await page.evaluate(sel => {
      const element = document.querySelector(sel);
      if (!element) {
        return { success: false, text: '', error: 'Element not found' };
      }

      // 提取文本内容，包括子元素
      const getTextContent = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent;
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
          const tagName = node.tagName.toLowerCase();
          // 跳过脚本和样式
          if (['script', 'style', 'noscript'].includes(tagName)) {
            return '';
          }

          return Array.from(node.childNodes)
            .map(child => getTextContent(child))
            .join('');
        }

        return '';
      };

      return {
        success: true,
        text: getTextContent(element),
        html: element.outerHTML
      };
    }, selector);

    if (!result.success) {
      logger.error(`[DEEP] 提取异常: ${error.message}`);
      return null;
    }

    return result.text;
  }
}
```

#### 混合提取器 (hybrid.js)

结合DOM和深度提取器，先尝试DOM模式，失败后回退到深度模式。

```javascript
export class HybridExtractor extends BaseExtractor {
  constructor() {
    super();
    this.id = 'hybrid_mode';
    this.name = 'Hybrid Extractor';
    this.domExtractor = new DOMExtractor();
    this.deepExtractor = new DeepBrowserExtractor();
  }

  async extract(page, selector) {
    // 先尝试DOM模式
    let result = await this.domExtractor.extract(page, selector);

    if (result && result.length > 0) {
      return result;
    }

    // DOM模式失败，尝试深度模式
    result = await this.deepExtractor.extract(page, selector);
    return result;
  }
}
```

#### 提取器注册表 (registry.js)

管理所有可用的提取器实例。

```javascript
export class ExtractorRegistry {
  constructor() {
    this.extractors = new Map();
    this.defaultId = 'deep_mode';

    // 注册内置提取器
    this.register(new DOMExtractor());
    this.register(new DeepBrowserExtractor());
    this.register(new HybridExtractor());
  }

  register(extractor) {
    if (!(extractor instanceof BaseExtractor)) {
      throw new Error('提取器必须继承自 BaseExtractor');
    }

    this.extractors.set(extractor.getId(), extractor);
    logger.info(`[REGISTRY] 已注册提取器: ${extractor.getId()} - ${extractor.getName()}`);
  }

  get(id) {
    return this.extractors.get(id);
  }

  getDefault() {
    return this.get(this.defaultId);
  }

  setDefault(id) {
    if (!this.extractors.has(id)) {
      throw new Error(`提取器不存在: ${id}`);
    }
    this.defaultId = id;
  }
}
```

### 工作流模块 (src/services/workflow/)

工作流模块负责执行网站配置中定义的操作步骤。

#### 工作流执行器 (executor.js)

执行单个工作流步骤。

```javascript
export class WorkflowExecutor {
  constructor(page, stealthMode = false, stopChecker = null, extractor = null) {
    this.page = page;
    this.stealthMode = stealthMode;
    this.finder = new ElementFinder(page);
    this.shouldStop = stopChecker || (() => false);
    this.extractor = extractor || extractorRegistry.getDefault();
    this.completionId = this.generateId();
  }

  async executeStep(action, selector, targetKey, value, optional, context) {
    if (this.shouldStop()) {
      logger.debug(`步骤 ${action} 跳过（已取消）`);
      return;
    }

    logger.debug(`执行: ${action} -> ${targetKey}`);

    try {
      switch (action) {
        case 'WAIT':
          await this.executeWait(parseFloat(value) || 0.5);
          break;

        case 'KEY_PRESS':
          await this.executeKeypress(targetKey || value);
          break;

        case 'CLICK':
          await this.executeClick(selector, targetKey, optional);
          break;

        case 'FILL_INPUT':
          const prompt = context?.prompt || '';
          await this.executeFill(selector, prompt, targetKey, optional);
          break;

        case 'STREAM_WAIT':
          const userInput = context?.prompt || '';
          await this.executeStream(selector, userInput);
          break;

        default:
          logger.debug(`未知动作: ${action}`);
      }
    } catch (error) {
      logger.error(`步骤执行失败 [${action}]: ${error.message}`);
      if (!optional) {
        throw error;
      }
    }
  }
}
```

支持的工作流步骤：
- `WAIT`: 等待指定时间（秒）
- `KEY_PRESS`: 按下指定键
- `CLICK`: 点击指定元素
- `FILL_INPUT`: 填充输入框
- `STREAM_WAIT`: 等待流式响应

### 流监控模块 (src/services/streamMonitor/)

流监控模块负责监听和格式化AI的流式响应。

#### 流监控器 (monitor.js)

监听AI响应并生成SSE格式的输出。

```javascript
export class StreamMonitor {
  constructor(page, formatter, stopChecker = null) {
    this.page = page;
    this.formatter = formatter;
    this.shouldStop = stopChecker || (() => false);
    this.streamCtx = null;
    this.finalCompleteText = '';
    this.generatingChecker = null;
    this.HARD_TIMEOUT = 300; // 5分钟绝对上限
    this.BASELINE_POLLUTION_THRESHOLD = 20;
  }

  async *monitor(selector, userInput = '', completionId = null) {
    // 阶段0：instant baseline
    ctx.instantBaseline = await this.getLatestMessageSnapshot(selector);
    ctx.instantLastNodeLen = ctx.instantBaseline.textLen || 0;

    // 阶段1：等待用户消息上屏
    await this.waitForUserMessage(selector, userInput, ctx);

    // 阶段2：监听AI回复
    yield* this.monitorAIResponse(selector, completionId, ctx);
  }
}
```

#### 流上下文 (context.js)

管理流式响应的上下文状态。

```javascript
export class StreamContext {
  constructor() {
    this.maxSeenText = '';
    this.sentContentLength = 0;
    this.baselineSnapshot = null;
    this.activeTurnStarted = false;
    this.stableTextCount = 0;
    this.lastStableText = '';
    this.activeTurnBaselineLen = 0;
    this.instantBaseline = null;
    this.userBaseline = null;
    this.instantLastNodeLen = 0;
    this.contentEverChanged = false;
    this.userMsgConfirmed = false;
    this.outputTargetAnchor = null;
    this.outputTargetCount = 0;
    this.pendingNewAnchor = null;
    this.pendingNewAnchorSeen = 0;
  }
}
```

#### 生成状态缓存 (statusCache.js)

缓存生成状态，避免重复查询DOM。

```javascript
export class GeneratingStatusCache {
  constructor(page) {
    this.page = page;
    this.lastCheckTime = 0;
    this.lastResult = false;
    this.checkInterval = 0.5;
    this.foundSelector = null;
  }

  async isGenerating() {
    const now = Date.now() / 1000;
    if (now - this.lastCheckTime < this.checkInterval) {
      return this.lastResult;
    }

    this.lastCheckTime = now;

    // 检查生成指示器
    if (this.foundSelector) {
      try {
        const element = await this.page.$(this.foundSelector);
        if (element) {
          const isVisible = await element.isIntersectingViewport();
          if (isVisible) {
            this.lastResult = true;
            return true;
          }
        }
      } catch (error) {
        // 忽略错误
      }
      this.foundSelector = null;
    }

    const indicatorSelectors = [
      'button[aria-label*="Stop"]',
      'button[aria-label*="stop"]',
      '[data-state="streaming"]',
      '.stop-generating'
    ];

    for (const selector of indicatorSelectors) {
      try {
        const element = await this.page.$(selector);
        if (element) {
          const isVisible = await element.isIntersectingViewport();
          if (isVisible) {
            this.lastResult = true;
            return true;
          }
        }
      } catch (error) {
        // 忽略错误
      }
    }

    return false;
  }
}
```

## 添加新网站支持

要添加对新AI网站的支持，需要完成以下步骤：

### 1. 创建自定义提取器

如果现有的提取器（DOM、深度、混合）不适用于新网站，创建新的提取器：

```javascript
// src/services/extractors/custom.js
import { BaseExtractor } from './base.js';
import { logger } from '../../utils/logger.js';

export class CustomExtractor extends BaseExtractor {
  constructor() {
    super();
    this.id = 'custom_mode';
    this.name = 'Custom Extractor';
  }

  async extract(page, selector) {
    try {
      const result = await page.evaluate(sel => {
        // 实现自定义提取逻辑
        const element = document.querySelector(sel);
        if (!element) {
          return { success: false, text: '', error: 'Element not found' };
        }

        return {
          success: true,
          text: element.innerText || element.textContent || '',
          html: element.outerHTML
        };
      }, selector);

      if (!result.success) {
        logger.warn(`[CUSTOM] 提取失败: ${result.error}`);
        return null;
      }

      return result.text;
    } catch (error) {
      logger.error(`[CUSTOM] 提取异常: ${error.message}`);
      return null;
    }
  }
}
```

### 2. 注册自定义提取器

在`src/services/extractors/registry.js`中注册新提取器：

```javascript
import { CustomExtractor } from './custom.js';

// 在构造函数中添加
this.register(new CustomExtractor());
```

### 3. 配置网站

在`config/sites.json`中添加新网站配置：

```json
{
  "your-site.com": {
    "url": "https://your-site.com",
    "selectors": {
      "input_box": "textarea[placeholder*='输入']",
      "send_btn": "button[type='submit']",
      "result_container": ".response-container",
      "new_chat_btn": "a[href*='/new-chat']"
    },
    "workflow": [
      {
        "action": "CLICK",
        "target": "new_chat_btn",
        "optional": true,
        "value": null
      },
      {
        "action": "WAIT",
        "target": "",
        "optional": false,
        "value": 0.5
      },
      {
        "action": "CLICK",
        "target": "input_box",
        "optional": false,
        "value": null
      },
      {
        "action": "FILL_INPUT",
        "target": "input_box",
        "optional": false,
        "value": null
      },
      {
        "action": "CLICK",
        "target": "send_btn",
        "optional": true,
        "value": null
      },
      {
        "action": "STREAM_WAIT",
        "target": "result_container",
        "optional": false,
        "value": null
      }
    ],
    "stealth": false,
    "extractor_id": "custom_mode"
  }
}
```

### 4. 测试新配置

使用浏览器访问新网站，测试配置是否正确工作。

## 最佳实践

1. **提取器选择**
   - 优先使用DOM提取器，性能更好
   - 对于复杂页面，使用深度或混合提取器
   - 自定义提取器应处理特定网站的特殊情况

2. **工作流设计**
   - 保持工作流步骤简单明了
   - 使用可选步骤处理可能失败的操作
   - 添加适当的等待时间，确保页面加载完成

3. **错误处理**
   - 在每个步骤中添加错误处理
   - 使用可选步骤避免整个工作流失败
   - 记录详细的错误日志

4. **性能优化**
   - 避免不必要的DOM查询
   - 使用缓存减少重复查询
   - 合理设置超时时间

## 故障排除

### 提取失败

如果提取器无法提取内容：
1. 检查选择器是否正确
2. 使用浏览器开发工具检查元素是否存在
3. 尝试不同的提取器模式
4. 检查页面是否完全加载

### 工作流执行失败

如果工作流步骤失败：
1. 检查目标元素是否存在
2. 增加等待时间，确保元素可交互
3. 检查元素是否可见
4. 查看日志了解具体失败原因

### 流监控问题

如果流监控异常：
1. 检查生成指示器是否正确识别
2. 检查超时设置是否合理
3. 检查页面是否有动态内容加载
4. 查看流上下文状态

## 测试

运行测试套件：

```bash
npm test
```

测试文件位于`tests/`目录，包括：
- 提取器测试
- 工作流执行器测试
- 流监控器测试
