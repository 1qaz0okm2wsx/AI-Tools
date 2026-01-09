/**
 * 混合提取器测试
 */

import { HybridExtractor } from '../../src/services/extractors/hybrid.js';

describe('HybridExtractor', () => {
  let extractor;
  let mockPage;
  let mockDomExtractor;
  let mockDeepExtractor;

  beforeEach(() => {
    mockDomExtractor = {
      extract: jest.fn().mockResolvedValue('DOM Result'),
      extractMultiple: jest.fn().mockResolvedValue(['DOM Result 1', 'DOM Result 2'])
    };

    mockDeepExtractor = {
      extract: jest.fn().mockResolvedValue('Deep Result'),
      extractMultiple: jest.fn().mockResolvedValue(['Deep Result 1', 'Deep Result 2'])
    };

    extractor = new HybridExtractor();
    // 替换内部提取器实例
    extractor.domExtractor = mockDomExtractor;
    extractor.deepExtractor = mockDeepExtractor;

    mockPage = {};
  });

  test('应该返回正确的ID', () => {
    expect(extractor.getId()).toBe('hybrid_mode');
  });

  test('应该返回正确的名称', () => {
    expect(extractor.getName()).toBe('Hybrid Extractor');
  });

  test('DOM提取成功时应该返回DOM结果', async () => {
    const result = await extractor.extract(mockPage, '.test-selector');
    expect(result).toBe('DOM Result');
    expect(mockDomExtractor.extract).toHaveBeenCalled();
  });

  test('DOM提取失败时应该尝试深度提取', async () => {
    mockDomExtractor.extract.mockResolvedValueOnce(null);
    const result = await extractor.extract(mockPage, '.test-selector');
    expect(result).toBe('Deep Result');
    expect(mockDeepExtractor.extract).toHaveBeenCalled();
  });

  test('DOM提取多个成功时应该返回DOM结果', async () => {
    const result = await extractor.extractMultiple(mockPage, '.test-selectors');
    expect(result).toEqual(['DOM Result 1', 'DOM Result 2']);
    expect(mockDomExtractor.extractMultiple).toHaveBeenCalled();
  });

  test('DOM提取多个失败时应该尝试深度提取', async () => {
    mockDomExtractor.extractMultiple.mockResolvedValueOnce([]);
    const result = await extractor.extractMultiple(mockPage, '.test-selectors');
    expect(result).toEqual(['Deep Result 1', 'Deep Result 2']);
    expect(mockDeepExtractor.extractMultiple).toHaveBeenCalled();
  });
});
