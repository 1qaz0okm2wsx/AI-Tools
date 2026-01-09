/**
 * API可用性检测模块 (ESM)
 */

import axios from 'axios';

const apiChecker = {
    // 存储API状态
    apiStatus: new Map(),

    // 检测单个API的可用性
    /**
     * @param {any} provider
     * @returns {Promise<any>}
     */
    async checkApiAvailability(provider) {
        const startTime = Date.now();
        // 设置超时时间 (确保在 try 和 catch 块中都可用)
        const timeout = provider.timeout || 10000;

        let status = {
            provider: provider.name,
            url: provider.url,
            status: 'checking',
            responseTime: null,
            error: null,
            lastChecked: new Date().toISOString()
        };

        try {
            // 智能处理检测URL
            let checkUrl = provider.url.trim();
            if (checkUrl.endsWith('/')) checkUrl = checkUrl.slice(0, -1);

            // 彻底解决重复拼接问题：规范化 URL，处理 v1, v2, v3, v4 等版本号
            if (checkUrl.toLowerCase().includes('/models') || checkUrl.toLowerCase().includes('/list')) {
                // 保持原样
            } else {
                // 检查是否是智谱AI的特殊URL格式
                if (checkUrl.toLowerCase().includes('bigmodel.cn')) {
                    if (checkUrl.toLowerCase().includes('/api/paas/v4')) {
                        checkUrl = `${checkUrl}/models`;
                    } else if (checkUrl.toLowerCase().endsWith('/v4')) {
                        checkUrl = `${checkUrl}/models`;
                    } else {
                        checkUrl = `${checkUrl}/api/paas/v4/models`;
                    }
                } else {
                    const versionMatch = checkUrl.match(/\/(v\d+)(\/api)?$/i);
                    if (versionMatch) {
                        checkUrl = `${checkUrl}/models`;
                    } else if (checkUrl.toLowerCase().endsWith('/api')) {
                        checkUrl = `${checkUrl}/v1/models`;
                    } else {
                        checkUrl = `${checkUrl}/v1/models`;
                    }
                }
            }

            // 最终清理：移除重复的 v1/v1, v4/v1, v4/v4 等
            checkUrl = checkUrl.replace(/([^:])\/\/+/g, '$1/');

            if (checkUrl.toLowerCase().includes('bigmodel.cn')) {
                checkUrl = checkUrl.replace(/\/api\/paas\/v4\/v1\/models/gi, '/api/paas/v4/models');
                checkUrl = checkUrl.replace(/\/v4\/v1\/models/gi, '/v4/models');
            }

            checkUrl = checkUrl.replace(/\/(v\d+)\/v\d+\//gi, '/$1/');
            checkUrl = checkUrl.replace(/\/models\/models/gi, '/models');
            checkUrl = checkUrl.replace(/\/api\/api/gi, '/api');

            console.log(`[API Checker] Testing ${provider.name} at ${checkUrl}`);

            /** @type {any} */
            let headers = {};
            if (provider.api_key) {
                headers['Authorization'] = `Bearer ${provider.api_key.trim()}`;
            }

            const response = await axios.get(checkUrl, {
                timeout: timeout,
                headers: headers,
                validateStatus: function (status) {
                    return (status >= 200 && status < 400) || status === 401 || status === 403 || status === 429;
                }
            });

            const responseTime = Date.now() - startTime;
            status.status = 'available';
            /** @type {number} */
            status.responseTime = responseTime;
            /** @type {number} */
            status.statusCode = response.status;

            if (response.headers) {
                /** @type {string} */
                status.server = response.headers.server || 'Unknown';
            }

            console.log(`✅ API可用: ${provider.name} (${provider.url}) - 响应时间: ${responseTime}ms`);

        } catch (error) {
            const responseTime = Date.now() - startTime;
            status.status = 'unavailable';
            /** @type {number} */
            status.responseTime = responseTime;
            status.error = error instanceof Error ? error.message : String(error);

            if (error.code === 'ECONNABORTED') {
                /** @type {string} */
                status.errorType = 'timeout';
                console.log(`⏱️ API超时: ${provider.name} (${provider.url}) - 超时时间: ${timeout}ms`);
            } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                /** @type {string} */
                status.errorType = 'connection';
                console.log(`🔌 连接失败: ${provider.name} (${provider.url}) - ${error instanceof Error ? error.message : String(error)}`);
            } else {
                /** @type {string} */
                status.errorType = 'other';
                console.log(`❌ API不可用: ${provider.name} (${provider.url}) - ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        this.apiStatus.set(provider.name, status);
        return status;
    },

    // 检测所有API的可用性
    /**
     * @param {any} providers
     * @returns {Promise<any[]>}
     */
    async checkAllApis(providers) {
        console.log('\n开始检测所有API的可用性...');
        /** @type {any[]} */
        const results = [];
        const promises = [];

        for (const provider of providers) {
            promises.push(
                this.checkApiAvailability(provider)
                    .then(status => {
                        results.push(status);
                        return status;
                    })
                    .catch(error => {
                        console.error(`检测API时出错: ${provider.name}`, error);
                        return {
                            provider: provider.name,
                            url: provider.url,
                            status: 'error',
                            error: error.message,
                            lastChecked: new Date().toISOString()
                        };
                    })
            );
        }

        await Promise.all(promises);
        const available = results.filter(r => r.status === 'available').length;
        const unavailable = results.filter(r => r.status === 'unavailable').length;
        const errors = results.filter(r => r.status === 'error').length;
        console.log(`\nAPI可用性检测完成: ${available} 可用, ${unavailable} 不可用, ${errors} 错误\n`);
        return results;
    },

    // 获取API状态摘要
    getApiStatusSummary() {
        const summary = {
            total: this.apiStatus.size,
            available: 0,
            unavailable: 0,
            error: 0,
            averageResponseTime: 0,
            lastChecked: null
        };

        let totalResponseTime = 0;
        let responseTimeCount = 0;

        for (const [name, status] of this.apiStatus.entries()) {
            switch (status.status) {
                case 'available':
                    summary.available++;
                    if (status.responseTime) {
                        totalResponseTime += status.responseTime;
                        responseTimeCount++;
                    }
                    break;
                case 'unavailable':
                    summary.unavailable++;
                    break;
                case 'error':
                    summary.error++;
                    break;
            }

            if (!summary.lastChecked || new Date(status.lastChecked) > new Date(summary.lastChecked)) {
                summary.lastChecked = status.lastChecked;
            }
        }

        if (responseTimeCount > 0) {
            summary.averageResponseTime = Math.round(totalResponseTime / responseTimeCount);
        }

        return summary;
    },

    // 获取所有API状态
    getAllApiStatus() {
        return Array.from(this.apiStatus.values());
    },

    // 获取特定API状态
    /**
     * @param {any} providerName
     * @returns {any}
     */
    getApiStatus(providerName) {
        return this.apiStatus.get(providerName);
    },

    // 启动定期检查
    /**
     * @param {any} providers
     * @param {number} intervalMs
     */
    startPeriodicCheck(providers, intervalMs = 60000) {
        this.checkAllApis(providers);
        /** @type {any} */
        this.checkInterval = setInterval(() => {
            this.checkAllApis(providers);
        }, intervalMs);
        console.log(`启动API可用性定期检查，间隔: ${intervalMs/1000}秒`);
    },

    // 停止定期检查
    stopPeriodicCheck() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            /** @type {null} */
            this.checkInterval = null;
            console.log('已停止API可用性定期检查');
        }
    }
};

export default apiChecker;
