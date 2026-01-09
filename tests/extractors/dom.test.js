/**
 * DOM提取器测试
 */

import { DOMExtractor } from '../../src/services/extractors/dom.js';

describe('DOMExtractor', () => {
  let extractor;
  let mockPage;

  beforeEach(() => {
    extractor = new DOMExtractor();
    mockPage = {
      evaluate: jest.fn((selector) => {
        if (selector === '.test-element') {
          return {
            success: true,
            text: 'Test Content',
            html: '<div class="test-element">Test Content</div>'
          };
        }
        return { success: false, text: '', error: 'Element not found' };
      })
    };
  });

  test('应该返回正确的ID', () => {
    expect(extractor.getId()).toBe('dom_mode');
  });

  test('应该返回正确的名称', () => {
    expect(extractor.getName()).toBe('DOM Mode Extractor');
  });

  test('应该成功提取元素', async () => {
    const result = await extractor.extract(mockPage, '.test-element');
    expect(result).toBe('Test Content');
  });

  test('元素不存在时应该返回null', async () => {
    const result = await extractor.extract(mockPage, '.non-existent');
    expect(result).toBeNull();
  });

  test('应该成功提取多个元素', async () => {
    mockPage.evaluate = jest.fn(() => {
      return Array.from([
        { innerText: 'Element 1', outerHTML: '<div>Element 1</div>' },
        { innerText: 'Element 2', outerHTML: '<div>Element 2</div>' }
      ]);
    });

    const results = await extractor.extractMultiple(mockPage, '.test-elements');
    expect(results).toHaveLength(2);
    expect(results[0].text).toBe('Element 1');
    expect(results[1].text).toBe('Element 2');
  });
});
