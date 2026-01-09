/**
 * 基础提取器测试
 */

import { BaseExtractor } from '../../src/services/extractors/base.js';

describe('BaseExtractor', () => {
  let extractor;

  beforeEach(() => {
    extractor = new BaseExtractor();
  });

  test('应该返回正确的ID', () => {
    expect(extractor.getId()).toBe('base');
  });

  test('应该返回正确的名称', () => {
    expect(extractor.getName()).toBe('Base Extractor');
  });

  test('extract方法应该抛出错误', async () => {
    const mockPage = {
      evaluate: jest.fn()
    };

    await expect(extractor.extract(mockPage, 'selector')).rejects.toThrow('extract 方法必须被子类实现');
  });

  test('extractMultiple方法应该抛出错误', async () => {
    const mockPage = {
      evaluate: jest.fn()
    };

    await expect(extractor.extractMultiple(mockPage, 'selector')).rejects.toThrow('extractMultiple 方法必须被子类实现');
  });
});
