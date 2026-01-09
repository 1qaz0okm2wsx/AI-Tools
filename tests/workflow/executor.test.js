/**
 * 工作流执行器测试
 */

import { WorkflowExecutor } from '../../src/services/workflow/executor.js';

describe('WorkflowExecutor', () => {
  let executor;
  let mockPage;
  let mockFinder;
  let mockMonitor;

  beforeEach(() => {
    mockPage = {
      evaluate: jest.fn(),
      $: jest.fn(),
      keyboard: {
        press: jest.fn().mockResolvedValue(undefined)
      }
    };

    mockFinder = {
      findWithFallback: jest.fn().mockResolvedValue({
        click: jest.fn().mockResolvedValue(undefined)
      })
    };

    mockMonitor = {
      monitor: jest.fn().mockImplementation(function*() {
        yield 'data: {"id":"test-1","object":"chat.completion.chunk","created":1234567890,"model":"web-browser","choices":[{"index":0,"delta":{"content":"Hello"}}]}\n';
        yield 'data: {"id":"test-2","object":"chat.completion.chunk","created":1234567891,"model":"web-browser","choices":[{"index":0,"delta":{"content":"World"}}]}\n';
        yield 'data: [DONE]\n';
      })
    };

    executor = new WorkflowExecutor(mockPage, false, () => false, null);
  });

  test('应该正确初始化', () => {
    expect(executor.page).toBe(mockPage);
    expect(executor.stealthMode).toBe(false);
    expect(executor.finder).toBeDefined();
    expect(executor.shouldStop).toBeDefined();
    expect(executor.extractor).toBeDefined();
    expect(executor.completionId).toBeDefined();
  });

  test('应该执行WAIT步骤', async () => {
    await executor.executeStep('WAIT', '', 0.5, false, {});
    expect(mockPage.evaluate).toHaveBeenCalled();
  });

  test('应该执行CLICK步骤', async () => {
    await executor.executeStep('CLICK', '.test-button', 'send_btn', false, {});
    expect(mockFinder.findWithFallback).toHaveBeenCalledWith('.test-button', 'send_btn');
  });

  test('应该执行FILL_INPUT步骤', async () => {
    await executor.executeStep('FILL_INPUT', '.test-input', 'input_box', false, { prompt: 'Test input' });
    expect(mockFinder.findWithFallback).toHaveBeenCalledWith('.test-input', 'input_box');
  });

  test('应该执行STREAM_WAIT步骤', async () => {
    await executor.executeStep('STREAM_WAIT', '.test-result', 'result_container', false, { prompt: 'Test prompt' });
    expect(mockMonitor.monitor).toHaveBeenCalledWith('.test-result', 'Test prompt', executor.completionId);
  });
});
