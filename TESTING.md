# 测试指南

## 运行测试

### 运行所有测试

```bash
npm test
```

### 运行特定测试文件

```bash
npm test -- extractors/base.test.js
npm test -- workflow/executor.test.js
npm test -- streamMonitor/monitor.test.js
```

### 监听模式

```bash
npm run test:watch
```

### 生成覆盖率报告

```bash
npm run test:coverage
```

## 测试文件结构

```
tests/
├── extractors/
│   ├── base.test.js          # 基础提取器测试
│   ├── dom.test.js            # DOM提取器测试
│   ├── deep.test.js           # 深度提取器测试
│   └── hybrid.test.js          # 混合提取器测试
├── workflow/
│   └── executor.test.js       # 工作流执行器测试
└── streamMonitor/
    └── monitor.test.js        # 流监控器测试
```

## 编写测试

### 基础测试模板

```javascript
import { YourClass } from '../../src/services/your-module.js';

describe('YourClass', () => {
  let instance;

  beforeEach(() => {
    instance = new YourClass();
  });

  afterEach(() => {
    // 清理资源
    if (instance.destroy) {
      instance.destroy();
    }
  });

  test('应该正确初始化', () => {
    expect(instance).toBeDefined();
    expect(instance.someProperty).toBe(expectedValue);
  });

  test('应该执行某个操作', async () => {
    const result = await instance.someMethod();
    expect(result).toBe(expectedResult);
  });
});
```

### 模拟依赖

使用Jest的模拟功能来隔离测试：

```javascript
const mockPage = {
  evaluate: jest.fn(),
  $: jest.fn(),
  keyboard: {
    press: jest.fn().mockResolvedValue(undefined)
  }
};

const mockFinder = {
  findWithFallback: jest.fn().mockResolvedValue({
    click: jest.fn().mockResolvedValue(undefined)
  })
};
```

### 异步测试

对于异步操作，使用async/await：

```javascript
test('异步操作测试', async () => {
  const result = await instance.asyncMethod();
  expect(result).toBeDefined();
});
```

### 错误处理测试

测试错误情况：

```javascript
test('应该正确处理错误', async () => {
  mockPage.evaluate.mockRejectedValueOnce(new Error('Test error'));

  await expect(instance.someMethod()).rejects.toThrow('Test error');
});
```

## 覆盖率目标

- 单元测试覆盖率：> 80%
- 关键模块覆盖率：> 90%

## 文档

项目文档位于`docs/`目录：

- `browser-automation.md`: 浏览器自动化模块详细文档
- `开发文档.md`: 项目整体开发文档

## 最佳实践

1. **测试隔离**
   - 每个测试应该独立运行
   - 使用模拟隔离依赖
   - 避免测试之间的状态共享

2. **测试命名**
   - 使用描述性的测试名称
   - 测试文件与被测试文件同名
   - 测试方法描述其行为

3. **断言清晰**
   - 使用明确的期望值
   - 提供有意义的错误消息
   - 验证所有重要的属性

4. **测试覆盖**
   - 测试正常路径和错误路径
   - 测试边界条件
   - 测试异步操作
   - 测试错误处理
