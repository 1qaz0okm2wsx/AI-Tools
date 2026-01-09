/**
 * 深度浏览器提取器测试
 */

import { DeepBrowserExtractor } from '../../src/services/extractors/deep.js';

describe('DeepBrowserExtractor', () => {
  let extractor;
  let mockPage;

  beforeEach(() => {
    extractor = new DeepBrowserExtractor();
    mockPage = {
      evaluate: jest.fn((selector) => {
        if (selector === '.test-content') {
          return {
            success: true,
            text: 'Deep Content',
            html: '<div class="test-content">Deep Content</div>'
          };
        }
        return { success: false, text: '', error: 'Element not found' };
      })
    };
  });

  test('应该返回正确的ID', () => {
    expect(extractor.getId()).toBe('deep_mode');
  });

  test('应该返回正确的名称', () => {
    expect(extractor.getName()).toBe('Deep Browser Extractor');
  });

  test('应该成功提取元素', async () => {
    const result = await extractor.extract(mockPage, '.test-content');
    expect(result).toBe('Deep Content');
  });

  test('应该跳过脚本和样式元素', async () => {
    mockPage.evaluate = jest.fn(() => {
      return {
        success: true,
        text: 'Content without scripts',
        html: '<div>Content without scripts<p>paragraph</p><span>text</span></div>'
      };
    });

    const result = await extractor.extract(mockPage, '.test-content');
    expect(result).toBe('Content without scriptsparagraph');
  });
});
