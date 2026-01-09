/**
 * OAuth管理路由
 * 支持OAuth提供商管理、授权流程、Token管理
 */

import express from 'express';
import { oauthManager } from '../src/services/oauthManager.js';
import { logger } from '../src/utils/logger.js';

const router = express.Router();

/**
 * OAuth管理页面
 */
router.get('/oauth', async (req, res) => {
  try {
    const providers = oauthManager.getAllProviders();
    const tokens = oauthManager.getAllTokens();
    const stats = oauthManager.getStats();

    res.render('oauth', {
      providers,
      tokens,
      stats,
      title: 'OAuth管理 - AI模型管理工具'
    });
  } catch (error) {
    logger.error('OAuth page error:', error);
    res.status(500).send('加载失败');
  }
});

/**
 * 获取OAuth提供商列表
 */
router.get('/api/oauth/providers', (req, res) => {
  try {
    const providers = oauthManager.getAllProviders();
    res.json({
      status: 'success',
      providers,
      count: Object.keys(providers).length
    });
  } catch (error) {
    logger.error('Get OAuth providers error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * 获取单个OAuth提供商配置
 */
router.get('/api/oauth/providers/:name', (req, res) => {
  try {
    const { name } = req.params;
    const provider = oauthManager.getProvider(name);

    if (!provider) {
      return res.status(404).json({
        status: 'error',
        error: `Provider not found: ${name}`
      });
    }

    const tokens = oauthManager.getTokens(name);
    const hasValidTokens = oauthManager.hasValidTokens(name);

    res.json({
      status: 'success',
      provider: {
        ...provider,
        hasTokens: !!tokens,
        hasValidTokens
      }
    });
  } catch (error) {
    logger.error('Get OAuth provider error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * 添加OAuth提供商
 */
router.post('/api/oauth/providers', async (req, res) => {
  try {
    const { name, config } = req.body;

    if (!name || !config) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing required fields: name, config'
      });
    }

    const requiredFields = ['authUrl', 'tokenUrl', 'clientId', 'clientSecret', 'redirectUri'];
    for (const field of requiredFields) {
      if (!config[field]) {
        return res.status(400).json({
          status: 'error',
          error: `Missing required field: ${field}`
        });
      }
    }

    await oauthManager.addProvider(name, config);

    res.json({
      status: 'success',
      message: `OAuth provider added: ${name}`
    });
  } catch (error) {
    logger.error('Add OAuth provider error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * 更新OAuth提供商
 */
router.put('/api/oauth/providers/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { config } = req.body;

    const existingProvider = oauthManager.getProvider(name);
    if (!existingProvider) {
      return res.status(404).json({
        status: 'error',
        error: `Provider not found: ${name}`
      });
    }

    await oauthManager.addProvider(name, { ...existingProvider, ...config });

    res.json({
      status: 'success',
      message: `OAuth provider updated: ${name}`
    });
  } catch (error) {
    logger.error('Update OAuth provider error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * 删除OAuth提供商
 */
router.delete('/api/oauth/providers/:name', async (req, res) => {
  try {
    const { name } = req.params;

    await oauthManager.deleteProvider(name);

    res.json({
      status: 'success',
      message: `OAuth provider deleted: ${name}`
    });
  } catch (error) {
    logger.error('Delete OAuth provider error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * 生成授权URL
 */
router.get('/api/oauth/authorize/:name', (req, res) => {
  try {
    const { name } = req.params;

    const authUrl = oauthManager.generateAuthUrl(name);

    res.json({
      status: 'success',
      authUrl,
      provider: name
    });
  } catch (error) {
    logger.error('Generate auth URL error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * 处理OAuth回调
 */
router.get('/api/oauth/callback/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { code, state, error } = req.query;

    if (error) {
      logger.error(`OAuth callback error for ${name}: ${error}`);
      return res.redirect(`/oauth?error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      return res.redirect('/oauth?error=missing_code');
    }

    const tokenData = await oauthManager.exchangeCodeForToken(name, code);

    res.redirect('/oauth?success=true');
  } catch (error) {
    logger.error('OAuth callback error:', error);
    res.redirect(`/oauth?error=${encodeURIComponent(error.message)}`);
  }
});

/**
 * 获取Token信息
 */
router.get('/api/oauth/tokens/:name', (req, res) => {
  try {
    const { name } = req.params;
    const tokens = oauthManager.getTokens(name);

    if (!tokens) {
      return res.status(404).json({
        status: 'error',
        error: `No tokens found for: ${name}`
      });
    }

    const hasValidTokens = oauthManager.hasValidTokens(name);

    res.json({
      status: 'success',
      tokens: {
        hasValidTokens,
        expiresAt: tokens.expiresAt,
        tokenType: tokens.tokenType,
        scope: tokens.scope,
        obtainedAt: tokens.obtainedAt,
        isExpired: tokens.expiresAt ? Date.now() >= tokens.expiresAt : false,
        expiresIn: tokens.expiresAt ? Math.max(0, tokens.expiresAt - Date.now()) : null
      }
    });
  } catch (error) {
    logger.error('Get OAuth tokens error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * 刷新Token
 */
router.post('/api/oauth/tokens/:name/refresh', async (req, res) => {
  try {
    const { name } = req.params;

    const tokenData = await oauthManager.refreshAccessToken(name);

    res.json({
      status: 'success',
      message: `Token refreshed for: ${name}`,
      tokens: {
        expiresAt: tokenData.expiresAt,
        tokenType: tokenData.tokenType
      }
    });
  } catch (error) {
    logger.error('Refresh OAuth token error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * 撤销Token
 */
router.delete('/api/oauth/tokens/:name', async (req, res) => {
  try {
    const { name } = req.params;

    await oauthManager.revokeToken(name);

    res.json({
      status: 'success',
      message: `Token revoked for: ${name}`
    });
  } catch (error) {
    logger.error('Revoke OAuth token error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * 获取OAuth统计信息
 */
router.get('/api/oauth/stats', (req, res) => {
  try {
    const stats = oauthManager.getStats();

    res.json({
      status: 'success',
      stats
    });
  } catch (error) {
    logger.error('Get OAuth stats error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

export default router;
