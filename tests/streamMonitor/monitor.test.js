/**
 * 流监控器测试
 */

import { StreamMonitor } from '../../src/services/streamMonitor/monitor.js';

describe('StreamMonitor', () => {
  let monitor;
  let mockPage;
  let mockFormatter;
  let mockContext;
  let mockCache;

  beforeEach(() => {
    mockPage = {
      $: jest.fn()
    };

    mockFormatter = {
      format: jest.fn((content, id) => `data: ${JSON.stringify({ id, content })}\n`)
    };

    mockContext = {
      instantBaseline: { textLen: 10, groupsCount: 1 },
      instantLastNodeLen: 10,
      resetForNewTarget: jest.fn()
    };

    mockCache = {
      isGenerating: jest.fn().mockResolvedValue(true)
    };

    monitor = new StreamMonitor(mockPage, mockFormatter, () => false);
    monitor.streamCtx = mockContext;
    monitor.generatingChecker = mockCache;
  });

  test('应该正确初始化', () => {
    expect(monitor.page).toBe(mockPage);
    expect(monitor.formatter).toBe(mockFormatter);
    expect(monitor.shouldStop).toBeDefined();
    expect(monitor.streamCtx).toBe(mockContext);
    expect(monitor.generatingChecker).toBe(mockCache);
    expect(monitor.HARD_TIMEOUT).toBe(300);
    expect(monitor.BASELINE_POLLUTION_THRESHOLD).toBe(20);
  });

  test('应该正确设置基线', async () => {
    mockPage.evaluate.mockResolvedValueOnce({
      textContent: 'Test baseline',
      innerText: 'Test baseline'
    });

    await monitor.monitor('.test-selector', 'Test input');

    expect(mockContext.instantBaseline).toEqual({
      textLen: 12,
      groupsCount: 1
    });
    expect(mockContext.instantLastNodeLen).toBe(12);
  });

  test('应该正确监听流式响应', async () => {
    const chunks = [];
    for await (const chunk of monitor.monitorAIResponse('.test-selector', 'test-id', mockContext)) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(mockFormatter.format).toHaveBeenCalledTimes(chunks.length);
  });
});
