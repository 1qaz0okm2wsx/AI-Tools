/**
 * 监控指标收集器
 */

import { logger } from '../utils/logger.js';

export class MetricsCollector {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        byProvider: {},
        byModel: {},
        byEndpoint: {}
      },
      responseTime: {
        min: Infinity,
        max: 0,
        avg: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        samples: []
      },
      errors: {
        total: 0,
        byType: {},
        byProvider: {},
        byModel: {}
      },
      resources: {
        memory: {
          used: 0,
          peak: 0,
          samples: []
        },
        cpu: {
          used: 0,
          peak: 0,
          samples: []
        }
      }
    };
    this.startTime = Date.now();
  }

  /**
   * 记录请求
   * @param {Object} request - 请求信息
   */
  recordRequest(request) {
    this.metrics.requests.total++;

    if (request.successful) {
      this.metrics.requests.successful++;
    } else {
      this.metrics.requests.failed++;
    }

    if (request.provider) {
      const providerKey = request.provider;
      this.metrics.requests.byProvider[providerKey] = 
        (this.metrics.requests.byProvider[providerKey] || 0) + 1;
    }

    if (request.model) {
      const modelKey = request.model;
      this.metrics.requests.byModel[modelKey] = 
        (this.metrics.requests.byModel[modelKey] || 0) + 1;
    }

    if (request.endpoint) {
      const endpointKey = request.endpoint;
      this.metrics.requests.byEndpoint[endpointKey] = 
        (this.metrics.requests.byEndpoint[endpointKey] || 0) + 1;
    }
  }

  /**
   * 记录响应时间
   * @param {number} duration - 响应时间（毫秒）
   */
  recordResponseTime(duration) {
    this.metrics.responseTime.samples.push(duration);
    this.metrics.responseTime.min = Math.min(this.metrics.responseTime.min, duration);
    this.metrics.responseTime.max = Math.max(this.metrics.responseTime.max, duration);

    const samples = this.metrics.responseTime.samples;
    const sum = samples.reduce((a, b) => a + b, 0);
    this.metrics.responseTime.avg = sum / samples.length;

    samples.sort((a, b) => a - b);
    this.metrics.responseTime.p50 = samples[Math.floor(samples.length * 0.5)] || 0;
    this.metrics.responseTime.p95 = samples[Math.floor(samples.length * 0.95)] || 0;
    this.metrics.responseTime.p99 = samples[Math.floor(samples.length * 0.99)] || 0;

    if (samples.length > 1000) {
      this.metrics.responseTime.samples = samples.slice(-1000);
    }
  }

  /**
   * 记录错误
   * @param {Object} error - 错误信息
   */
  recordError(error) {
    this.metrics.errors.total++;

    if (error.type) {
      const typeKey = error.type;
      this.metrics.errors.byType[typeKey] = 
        (this.metrics.errors.byType[typeKey] || 0) + 1;
    }

    if (error.provider) {
      const providerKey = error.provider;
      this.metrics.errors.byProvider[providerKey] = 
        (this.metrics.errors.byProvider[providerKey] || 0) + 1;
    }

    if (error.model) {
      const modelKey = error.model;
      this.metrics.errors.byModel[modelKey] = 
        (this.metrics.errors.byModel[modelKey] || 0) + 1;
    }
  }

  /**
   * 记录资源使用
   * @param {Object} resources - 资源信息
   */
  recordResources(resources) {
    if (resources.memory) {
      this.metrics.resources.memory.used = resources.memory;
      this.metrics.resources.memory.peak = 
        Math.max(this.metrics.resources.memory.peak, resources.memory);
      this.metrics.resources.memory.samples.push(resources.memory);

      if (this.metrics.resources.memory.samples.length > 100) {
        this.metrics.resources.memory.samples = 
          this.metrics.resources.memory.samples.slice(-100);
      }
    }

    if (resources.cpu) {
      this.metrics.resources.cpu.used = resources.cpu;
      this.metrics.resources.cpu.peak = 
        Math.max(this.metrics.resources.cpu.peak, resources.cpu);
      this.metrics.resources.cpu.samples.push(resources.cpu);

      if (this.metrics.resources.cpu.samples.length > 100) {
        this.metrics.resources.cpu.samples = 
          this.metrics.resources.cpu.samples.slice(-100);
      }
    }
  }

  /**
   * 获取所有指标
   * @returns {Object} 指标数据
   */
  getMetrics() {
    const uptime = Date.now() - this.startTime;

    return {
      uptime,
      requests: {
        ...this.metrics.requests,
        successRate: this.metrics.requests.total > 0 ?
          (this.metrics.requests.successful / this.metrics.requests.total * 100).toFixed(2) : 0,
        errorRate: this.metrics.requests.total > 0 ?
          (this.metrics.requests.failed / this.metrics.requests.total * 100).toFixed(2) : 0
      },
      responseTime: {
        min: this.metrics.responseTime.min === Infinity ? 0 : this.metrics.responseTime.min,
        max: this.metrics.responseTime.max,
        avg: this.metrics.responseTime.avg,
        p50: this.metrics.responseTime.p50,
        p95: this.metrics.responseTime.p95,
        p99: this.metrics.responseTime.p99
      },
      errors: {
        ...this.metrics.errors,
        errorRate: this.metrics.requests.total > 0 ?
          (this.metrics.errors.total / this.metrics.requests.total * 100).toFixed(2) : 0
      },
      resources: {
        memory: {
          current: this.metrics.resources.memory.used,
          peak: this.metrics.resources.memory.peak,
          avg: this.metrics.resources.memory.samples.length > 0 ?
            this.metrics.resources.memory.samples.reduce((a, b) => a + b, 0) / 
            this.metrics.resources.memory.samples.length : 0
        },
        cpu: {
          current: this.metrics.resources.cpu.used,
          peak: this.metrics.resources.cpu.peak,
          avg: this.metrics.resources.cpu.samples.length > 0 ?
            this.metrics.resources.cpu.samples.reduce((a, b) => a + b, 0) / 
            this.metrics.resources.cpu.samples.length : 0
        }
      }
    };
  }

  /**
   * 重置指标
   */
  reset() {
    this.metrics = {
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        byProvider: {},
        byModel: {},
        byEndpoint: {}
      },
      responseTime: {
        min: Infinity,
        max: 0,
        avg: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        samples: []
      },
      errors: {
        total: 0,
        byType: {},
        byProvider: {},
        byModel: {}
      },
      resources: {
        memory: {
          used: 0,
          peak: 0,
          samples: []
        },
        cpu: {
          used: 0,
          peak: 0,
          samples: []
        }
      }
    };
    this.startTime = Date.now();
    logger.info('[METRICS] 指标已重置');
  }
}

export default new MetricsCollector();