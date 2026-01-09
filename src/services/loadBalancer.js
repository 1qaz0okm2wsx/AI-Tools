/**
 * 负载均衡器
 */

import { logger } from '../utils/logger.js';
import configService from '../config/index.js';

export class LoadBalancer {
  constructor() {
    this.providers = new Map();
    this.strategy = 'round_robin'; // round_robin, least_connections, weighted, random
    this.currentIndex = 0;
    this.providerStats = new Map();
  }

  /**
   * 初始化负载均衡器
   */
  init() {
    const mode = configService.getUsageMode();

    if (mode === 'personal') {
      this.strategy = 'first_available';
      logger.info('[LOAD_BALANCER] 负载均衡器已初始化（个人模式：使用第一个可用提供商）');
    } else {
      this.strategy = 'round_robin';
      logger.info('[LOAD_BALANCER] 负载均衡器已初始化（服务模式：轮询策略）');
    }
  }

  /**
   * 添加提供商
   * @param {Object} provider - 提供商配置
   * @param {number} [weight] - 权重
   */
  addProvider(provider, weight = 1) {
    this.providers.set(provider.id, {
      ...provider,
      weight,
      connections: 0,
      lastUsed: null,
      healthy: true,
      errorCount: 0
    });

    this.providerStats.set(provider.id, {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      avgResponseTime: 0,
      responseTimes: []
    });

    logger.info(`[LOAD_BALANCER] 已添加提供商: ${provider.name} (权重: ${weight})`);
  }

  /**
   * 移除提供商
   * @param {string} providerId - 提供商ID
   */
  removeProvider(providerId) {
    this.providers.delete(providerId);
    this.providerStats.delete(providerId);
    logger.info(`[LOAD_BALANCER] 已移除提供商: ${providerId}`);
  }

  /**
   * 选择提供商
   * @returns {Object | undefined} 提供商对象
   */
  selectProvider() {
    const availableProviders = Array.from(this.providers.values())
      .filter(p => p.healthy);

    if (availableProviders.length === 0) {
      logger.warn('[LOAD_BALANCER] 没有可用的提供商');
      return undefined;
    }

    let selectedProvider;

    switch (this.strategy) {
      case 'first_available':
        selectedProvider = availableProviders[0];
        break;

      case 'round_robin':
        selectedProvider = availableProviders[this.currentIndex % availableProviders.length];
        this.currentIndex++;
        break;

      case 'least_connections':
        selectedProvider = availableProviders
          .sort((a, b) => a.connections - b.connections)[0];
        break;

      case 'weighted':
        selectedProvider = this.selectWeightedProvider(availableProviders);
        break;

      case 'random':
        const randomIndex = Math.floor(Math.random() * availableProviders.length);
        selectedProvider = availableProviders[randomIndex];
        break;

      default:
        selectedProvider = availableProviders[0];
    }

    if (selectedProvider) {
      selectedProvider.connections++;
      selectedProvider.lastUsed = Date.now();
      this.recordRequest(selectedProvider.id);
    }

    return selectedProvider;
  }

  /**
   * 选择加权提供商
   * @param {Array} providers - 提供商列表
   * @returns {Object} 提供商对象
   */
  selectWeightedProvider(providers) {
    const totalWeight = providers.reduce((sum, p) => sum + p.weight, 0);
    let random = Math.random() * totalWeight;

    for (const provider of providers) {
      random -= provider.weight;
      if (random <= 0) {
        return provider;
      }
    }

    return providers[0];
  }

  /**
   * 记录请求
   * @param {string} providerId - 提供商ID
   */
  recordRequest(providerId) {
    const stats = this.providerStats.get(providerId);
    if (stats) {
      stats.totalRequests++;
    }
  }

  /**
   * 记录成功
   * @param {string} providerId - 提供商ID
   * @param {number} responseTime - 响应时间
   */
  recordSuccess(providerId, responseTime) {
    const provider = this.providers.get(providerId);
    const stats = this.providerStats.get(providerId);

    if (provider && stats) {
      provider.connections--;
      provider.errorCount = 0;
      stats.successfulRequests++;

      stats.responseTimes.push(responseTime);
      if (stats.responseTimes.length > 100) {
        stats.responseTimes.shift();
      }

      const sum = stats.responseTimes.reduce((a, b) => a + b, 0);
      stats.avgResponseTime = sum / stats.responseTimes.length;
    }
  }

  /**
   * 记录失败
   * @param {string} providerId - 提供商ID
   */
  recordFailure(providerId) {
    const provider = this.providers.get(providerId);
    const stats = this.providerStats.get(providerId);

    if (provider && stats) {
      provider.connections--;
      provider.errorCount++;
      stats.failedRequests++;

      if (provider.errorCount >= 5) {
        provider.healthy = false;
        logger.warn(`[LOAD_BALANCER] 提供商 ${providerId} 标记为不健康（错误次数: ${provider.errorCount}）`);
      }
    }
  }

  /**
   * 健康检查
   * @param {string} providerId - 提供商ID
   * @param {boolean} healthy - 是否健康
   */
  setHealth(providerId, healthy) {
    const provider = this.providers.get(providerId);
    if (provider) {
      provider.healthy = healthy;
      if (!healthy) {
        provider.errorCount = 0;
      }
      logger.info(`[LOAD_BALANCER] 提供商 ${providerId} 健康状态: ${healthy ? '健康' : '不健康'}`);
    }
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const providers = Array.from(this.providers.values());
    const stats = this.providerStats;

    return {
      strategy: this.strategy,
      totalProviders: providers.length,
      healthyProviders: providers.filter(p => p.healthy).length,
      providers: providers.map(p => ({
        id: p.id,
        name: p.name,
        weight: p.weight,
        connections: p.connections,
        healthy: p.healthy,
        errorCount: p.errorCount,
        lastUsed: p.lastUsed,
        stats: stats.get(p.id) || {}
      }))
    };
  }

  /**
   * 重置统计
   */
  resetStats() {
    for (const [providerId, stats] of this.providerStats) {
      this.providerStats.set(providerId, {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        avgResponseTime: 0,
        responseTimes: []
      });
    }
    logger.info('[LOAD_BALANCER] 统计已重置');
  }
}

export default new LoadBalancer();