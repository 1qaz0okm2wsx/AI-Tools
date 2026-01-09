/**
 * OAuth管理服务模块
 * 支持自动登录、Token管理、授权流程
 */

import { logger } from '../utils/logger.js';
import { encryptionService } from '../utils/encryption.js';
import fs from 'fs/promises';
import path from 'path';

class OAuthManager {
  constructor() {
    this.tokensDir = path.join(process.cwd(), 'oauth_tokens');
    this.providers = new Map();
    this.tokens = new Map();
  }

  async init() {
    try {
      await fs.mkdir(this.tokensDir, { recursive: true });
      logger.info('[OAUTH] OAuth tokens directory created');

      await this.loadProviders();
      await this.loadTokens();
    } catch (error) {
      if (error.code !== 'EEXIST') {
        logger.error(`[OAUTH] Failed to initialize: ${error.message}`);
      }
    }
  }

  async loadProviders() {
    try {
      const providersPath = path.join(process.cwd(), 'config', 'oauth_providers.json');
      const data = await fs.readFile(providersPath, 'utf-8');
      const providers = JSON.parse(data);

      this.providers.clear();
      for (const [name, config] of Object.entries(providers)) {
        this.providers.set(name, config);
      }

      logger.info(`[OAUTH] Loaded ${this.providers.size} OAuth providers`);
    } catch (error) {
      logger.warn(`[OAUTH] Failed to load providers: ${error.message}`);
      this.providers.clear();
    }
  }

  async loadTokens() {
    try {
      const files = await fs.readdir(this.tokensDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const providerName = file.replace('.json', '');
          try {
            const filePath = path.join(this.tokensDir, file);
            const data = await fs.readFile(filePath, 'utf-8');
            let tokenData = JSON.parse(data);

            if (tokenData.encrypted) {
              tokenData = encryptionService.decrypt(tokenData);
            }

            this.tokens.set(providerName, tokenData);
            logger.debug(`[OAUTH] Loaded tokens for: ${providerName}`);
          } catch (error) {
            logger.error(`[OAUTH] Failed to load tokens for ${providerName}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      logger.error(`[OAUTH] Failed to load tokens directory: ${error.message}`);
    }
  }

  async saveTokens(providerName, tokenData) {
    try {
      const encrypted = encryptionService.encrypt(tokenData);
      const filePath = path.join(this.tokensDir, `${providerName}.json`);
      await fs.writeFile(filePath, JSON.stringify(encrypted, null, 2), 'utf-8');

      this.tokens.set(providerName, tokenData);
      logger.info(`[OAUTH] Saved tokens for: ${providerName}`);
    } catch (error) {
      logger.error(`[OAUTH] Failed to save tokens for ${providerName}: ${error.message}`);
      throw error;
    }
  }

  async deleteTokens(providerName) {
    try {
      const filePath = path.join(this.tokensDir, `${providerName}.json`);
      await fs.unlink(filePath);
      this.tokens.delete(providerName);
      logger.info(`[OAUTH] Deleted tokens for: ${providerName}`);
    } catch (error) {
      logger.error(`[OAUTH] Failed to delete tokens for ${providerName}: ${error.message}`);
      throw error;
    }
  }

  getProvider(name) {
    return this.providers.get(name);
  }

  getAllProviders() {
    return Object.fromEntries(this.providers);
  }

  getTokens(providerName) {
    return this.tokens.get(providerName);
  }

  getAllTokens() {
    return Object.fromEntries(this.tokens);
  }

  hasValidTokens(providerName) {
    const tokenData = this.tokens.get(providerName);
    if (!tokenData) return false;

    const now = Date.now();
    if (tokenData.expiresAt && now >= tokenData.expiresAt) {
      logger.warn(`[OAUTH] Tokens expired for: ${providerName}`);
      this.tokens.delete(providerName);
      return false;
    }

    return true;
  }

  async addProvider(name, config) {
    this.providers.set(name, config);

    try {
      const providersPath = path.join(process.cwd(), 'config', 'oauth_providers.json');
      const providersData = JSON.stringify(Object.fromEntries(this.providers), null, 2);
      await fs.writeFile(providersPath, providersData, 'utf-8');

      logger.info(`[OAUTH] Added OAuth provider: ${name}`);
    } catch (error) {
      logger.error(`[OAUTH] Failed to save provider: ${error.message}`);
      throw error;
    }
  }

  async deleteProvider(name) {
    this.providers.delete(name);

    try {
      const providersPath = path.join(process.cwd(), 'config', 'oauth_providers.json');
      const providersData = JSON.stringify(Object.fromEntries(this.providers), null, 2);
      await fs.writeFile(providersPath, providersData, 'utf-8');

      await this.deleteTokens(name);
      logger.info(`[OAUTH] Deleted OAuth provider: ${name}`);
    } catch (error) {
      logger.error(`[OAUTH] Failed to delete provider: ${error.message}`);
      throw error;
    }
  }

  generateAuthUrl(providerName) {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }

    const { authUrl, clientId, redirectUri, scope } = provider;
    const state = this.generateState();

    const url = new URL(authUrl);
    url.searchParams.append('client_id', clientId);
    url.searchParams.append('redirect_uri', redirectUri);
    url.searchParams.append('response_type', 'code');
    url.searchParams.append('scope', scope || '');
    url.searchParams.append('state', state);

    return url.toString();
  }

  async exchangeCodeForToken(providerName, code) {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }

    const { tokenUrl, clientId, clientSecret, redirectUri } = provider;

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error_description || data.error || 'Token exchange failed');
      }

      const tokenData = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : null,
        tokenType: data.token_type,
        scope: data.scope,
        obtainedAt: Date.now(),
      };

      await this.saveTokens(providerName, tokenData);

      logger.info(`[OAUTH] Successfully exchanged token for: ${providerName}`);
      return tokenData;
    } catch (error) {
      logger.error(`[OAUTH] Token exchange failed for ${providerName}: ${error.message}`);
      throw error;
    }
  }

  async refreshAccessToken(providerName) {
    const tokenData = this.tokens.get(providerName);
    if (!tokenData || !tokenData.refreshToken) {
      throw new Error(`No refresh token available for: ${providerName}`);
    }

    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }

    const { tokenUrl, clientId, clientSecret } = provider;

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: tokenData.refreshToken,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error_description || data.error || 'Token refresh failed');
      }

      tokenData.accessToken = data.access_token;
      tokenData.expiresAt = data.expires_in ? Date.now() + data.expires_in * 1000 : null;
      tokenData.tokenType = data.token_type;
      if (data.refresh_token) {
        tokenData.refreshToken = data.refresh_token;
      }

      await this.saveTokens(providerName, tokenData);

      logger.info(`[OAUTH] Successfully refreshed token for: ${providerName}`);
      return tokenData;
    } catch (error) {
      logger.error(`[OAUTH] Token refresh failed for ${providerName}: ${error.message}`);
      throw error;
    }
  }

  async getValidAccessToken(providerName) {
    if (!this.hasValidTokens(providerName)) {
      throw new Error(`No valid tokens for: ${providerName}`);
    }

    const tokenData = this.tokens.get(providerName);

    if (tokenData.expiresAt && Date.now() >= tokenData.expiresAt - 60000) {
      logger.info(`[OAUTH] Token expiring soon, refreshing for: ${providerName}`);
      return await this.refreshAccessToken(providerName);
    }

    return tokenData.accessToken;
  }

  async revokeToken(providerName) {
    const tokenData = this.tokens.get(providerName);
    if (!tokenData) {
      return;
    }

    const provider = this.providers.get(providerName);
    if (!provider || !provider.revokeUrl) {
      await this.deleteTokens(providerName);
      return;
    }

    try {
      await fetch(provider.revokeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          token: tokenData.accessToken,
          token_type_hint: 'access_token',
        }),
      });

      logger.info(`[OAUTH] Revoked token for: ${providerName}`);
    } catch (error) {
      logger.warn(`[OAUTH] Failed to revoke token for ${providerName}: ${error.message}`);
    } finally {
      await this.deleteTokens(providerName);
    }
  }

  generateState() {
    return Buffer.from(Date.now() + Math.random()).toString('base64');
  }

  validateState(state, storedState) {
    return state === storedState;
  }

  getStats() {
    const providers = Array.from(this.providers.keys());
    const activeTokens = [];
    const expiredTokens = [];
    const now = Date.now();

    providers.forEach(providerName => {
      const tokenData = this.tokens.get(providerName);
      if (tokenData) {
        if (tokenData.expiresAt && now >= tokenData.expiresAt) {
          expiredTokens.push(providerName);
        } else {
          activeTokens.push(providerName);
        }
      }
    });

    return {
      totalProviders: providers.length,
      activeTokens: activeTokens.length,
      expiredTokens: expiredTokens.length,
      providersWithTokens: activeTokens.concat(expiredTokens),
      providersWithoutTokens: providers.filter(p => !this.tokens.has(p)),
    };
  }
}

export const oauthManager = new OAuthManager();
