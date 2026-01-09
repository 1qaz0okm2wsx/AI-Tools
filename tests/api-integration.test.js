/**
 * API功能完整性测试
 * 测试OAuth管理、统一API网关、浏览器自动化等功能
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

describe('API功能完整性测试', () => {
  const BASE_URL = 'http://localhost:3000';

  describe('OAuth管理API', () => {
    it('应该能获取OAuth统计信息', async () => {
      const response = await fetch(`${BASE_URL}/api/oauth/stats`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
      expect(data.stats).toBeDefined();
      expect(data.stats.totalProviders).toBeDefined();
      expect(data.stats.activeTokens).toBeDefined();
      expect(data.stats.expiredTokens).toBeDefined();
    });

    it('应该能获取OAuth提供商列表', async () => {
      const response = await fetch(`${BASE_URL}/api/oauth/providers`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
      expect(data.providers).toBeDefined();
      expect(typeof data.providers).toBe('object');
    });
  });

  describe('统一API网关', () => {
    it('应该能获取网关信息', async () => {
      const response = await fetch(`${BASE_URL}/v1/ai/info`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.name).toBe('AI Unified Gateway');
      expect(data.version).toBe('2.0.0');
      expect(data.services).toBeDefined();
      expect(data.services.openai_api).toBeDefined();
      expect(data.services.browser_automation).toBeDefined();
      expect(data.services.oauth).toBeDefined();
    });

    it('应该能获取模型列表', async () => {
      const response = await fetch(`${BASE_URL}/v1/ai/models`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.object).toBe('list');
      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.service_info).toBeDefined();
      expect(data.service_info.api_models_count).toBeDefined();
      expect(data.service_info.browser_models_count).toBeDefined();
      expect(data.service_info.oauth_models_count).toBeDefined();
      expect(data.service_info.total_models_count).toBeDefined();
    });

    it('应该能处理无效请求', async () => {
      const response = await fetch(`${BASE_URL}/v1/ai/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'auto',
          messages: []
        })
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBeDefined();
      expect(data.error.type).toBe('invalid_request_error');
    });
  });

  describe('浏览器自动化API', () => {
    it('应该能获取浏览器健康状态', async () => {
      const response = await fetch(`${BASE_URL}/v1/browser/health`);
      const data = await response.json();

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(data.service).toBeDefined();
      expect(data.browser).toBeDefined();
    });

    it('应该能获取浏览器模型列表', async () => {
      const response = await fetch(`${BASE_URL}/v1/browser/models`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.object).toBe('list');
      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  describe('Cookie管理API', () => {
    it('应该能列出Cookie域名', async () => {
      const response = await fetch(`${BASE_URL}/api/browser/cookies`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.domains).toBeDefined();
      expect(Array.isArray(data.domains)).toBe(true);
      expect(data.count).toBeDefined();
    });
  });

  describe('API文档', () => {
    it('应该能加载API文档页面', async () => {
      const response = await fetch(`${BASE_URL}/api-docs`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
    });
  });

  describe('OAuth管理页面', () => {
    it('应该能加载OAuth管理页面', async () => {
      const response = await fetch(`${BASE_URL}/oauth`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
    });
  });

  describe('浏览器自动化页面', () => {
    it('应该能加载浏览器自动化页面', async () => {
      const response = await fetch(`${BASE_URL}/browser`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
    });
  });
});
