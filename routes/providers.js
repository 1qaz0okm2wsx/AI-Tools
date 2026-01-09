
/**
 * 提供商管理路由 (ESM)
 */

import express from 'express';
import ModelAnalyzer from '../modelAnalyzer.js';
import ModelAnalyzerEnhanced from '../modelAnalyzer_enhanced.js';
import { logOperation } from '../db_init.js';
import { logger } from '../src/utils/logger.js';
import { encryptionService } from '../src/utils/encryption.js';

const router = express.Router();

// 添加提供商路由
router.post('/add-provider', (req, res) => {
    const db = req.app?.locals?.db || /** @type {any} */ (globalThis).db;
    let { name, url, website, apiKeys, keyNames, defaultKey, endpoints, endpointNames, defaultEndpoint } = req.body;

    // 验证必填字段
    if (!url) {
        return res.status(400).json({ error: '主API接口地址是必填项' });
    }

    // 自动生成名称
    if (!name || name === '自动生成') {
        name = `提供商 ${new Date().toLocaleString('zh-CN')}`;
    }

    // 处理API密钥
    /** @type {string[]} */
    let keys = [];
    /** @type {string[]} */
    let names = [];

    if (Array.isArray(apiKeys)) {
        keys = apiKeys.filter(k => k && k.trim() !== '');
    } else if (typeof apiKeys === 'string' && apiKeys.trim() !== '') {
        keys = [apiKeys];
    }

    if (Array.isArray(keyNames)) {
        names = keyNames.filter(n => n && n.trim() !== '');
    } else if (typeof keyNames === 'string' && keyNames.trim() !== '') {
        names = [keyNames];
    }

    // 确保密钥和名称数组长度一致
    // 自动按顺序生成密钥名称
    names = keys.map((_, index) => `密钥 ${index + 1}`);

    // 确定默认密钥索引
    const defaultKeyIndex = parseInt(defaultKey) || 0;
    const mainApiKey = keys.length > 0 ? keys[defaultKeyIndex] : null;

    // 处理API接口地址
    /** @type {string[]} */
    let endpointUrls = [];
    /** @type {string[]} */
    let endpointNameList = [];

    if (Array.isArray(endpoints)) {
        endpointUrls = endpoints.filter(e => e && e.trim() !== '');
    } else if (typeof endpoints === 'string' && endpoints.trim() !== '') {
        endpointUrls = [endpoints];
    }

    if (Array.isArray(endpointNames)) {
        endpointNameList = endpointNames.filter(n => n && n.trim() !== '');
    } else if (typeof endpointNames === 'string' && endpointNames.trim() !== '') {
        endpointNameList = [endpointNames];
    }

    // 确保接口名称和URL数组长度一致
    // 自动按顺序生成接口名称
    endpointNameList = endpointUrls.map((_, index) => `接口 ${index + 1}`);

    // 确定默认接口索引
    parseInt(defaultEndpoint) || 0;

    // 插入提供商
    db.run(
        `INSERT INTO providers (name, url, website, api_key) VALUES (?, ?, ?, ?)`,
        [name, url, website || '', mainApiKey],
        /** @this {{ lastID: number }} */
        function(/** @type {any} */ err) {
            if (err) {
                logger.error('添加提供商失败:', err.message);
                return res.status(500).json({ error: '添加提供商失败: ' + err.message });
            }

            const providerId = this.lastID;

            // 保存所有密钥到api_keys表（加密存储）
            if (keys.length > 0) {
                const stmt = db.prepare(`INSERT INTO api_keys (provider_id, key_name, api_key, is_active) VALUES (?, ?, ?, 1)`);
                keys.forEach((key, index) => {
                    try {
                        // 加密API密钥
                        const encryptedKey = encryptionService.encrypt(key);
                        // 将加密后的数据存储为JSON字符串
                        stmt.run([providerId, names[index] || `密钥 ${index + 1}`, JSON.stringify(encryptedKey)]);
                        logger.info(`[ENCRYPTION] API密钥已加密保存: ${names[index] || `密钥 ${index + 1}`}`);
                    } catch (/** @type {any} */ error) {
                        logger.error(`[ENCRYPTION] 加密API密钥失败: ${error.message}`);
                        // 如果加密失败，仍然保存明文（不推荐，但确保系统可用）
                        stmt.run([providerId, names[index] || `密钥 ${index + 1}`, key]);
                    }
                });
                stmt.finalize();
            }

            // 保存所有API接口地址到api_endpoints表
            if (endpointUrls.length > 0) {
                const stmt = db.prepare(`INSERT INTO api_endpoints (provider_id, endpoint_url, endpoint_name, is_active) VALUES (?, ?, ?, 1)`);
                endpointUrls.forEach((endpointUrl, index) => {
                    stmt.run([providerId, endpointUrl, endpointNameList[index] || `接口 ${index + 1}`]);
                });
                stmt.finalize();
            }

            // 记录操作日志
            logOperation(db, 'CREATE', 'provider', providerId, name, `添加提供商: ${name}，共添加${keys.length}个API密钥和${endpointUrls.length}个API接口`, 'success', req);

            // 自动检测模型
            const provider = {
                id: providerId,
                name: name,
                url: url,
                api_key: mainApiKey
            };

            detectModelsForProvider(provider, db)
                .then(models => {
                    logger.info(`✅ 成功为提供商 ${name} 检测到 ${models.length} 个模型`);
                    res.redirect('/?success=' + encodeURIComponent(`提供商 ${name} 已添加，检测到 ${models.length} 个模型`));
                })
                .catch(error => {
                    logger.error(`❌ 为提供商 ${name} 检测模型失败:`, error.message);
                    res.redirect('/?success=' + encodeURIComponent(`提供商 ${name} 已添加，但模型检测失败: ${error.message}`));
                });
        }
    );
});

// 编辑提供商页面
router.get('/edit-provider/:id', (req, res) => {
    const db = req.app?.locals?.db || /** @type {any} */ (globalThis).db;
    const providerId = req.params.id;

    db.get(`SELECT * FROM providers WHERE id = ?`, [providerId], (/** @type {any} */ err, /** @type {any} */ provider) => {
        if (err) {
            logger.error('查询提供商错误:', err);
            return res.redirect('/?error=' + encodeURIComponent('查询提供商时发生错误: ' + err.message));
        }

        if (!provider) {
            return res.redirect('/?error=' + encodeURIComponent('未找到指定的提供商'));
        }

        res.render('edit-provider', {
            provider,
            error: req.query.error,
            success: req.query.success,
            savedForm: {
                name: provider.name,
                url: provider.url,
                website: provider.website
            }
        });
    });
});

// 处理编辑提供商表单
router.post('/edit-provider/:id', (req, res) => {
    const db = req.app?.locals?.db || /** @type {any} */ (globalThis).db;
    const providerId = req.params.id;
    let { name, url, website, apiKeys, keyIds, defaultKey, endpoints, endpointIds } = req.body;

    // 验证必填字段
    if (!url) {
        return res.redirect(`/edit-provider/${providerId}?error=` + encodeURIComponent('API接口地址是必填项'));
    }

    // 自动生成名称
    if (!name || name === '自动生成') {
        name = `提供商 ${new Date().toLocaleString('zh-CN')}`;
    }

    // 确定默认密钥索引
    const defaultKeyIndex = parseInt(defaultKey) || 0;
    const mainApiKey = Array.isArray(apiKeys) && apiKeys.length > 0 ? apiKeys[defaultKeyIndex] : (typeof apiKeys === 'string' ? apiKeys : null);

    // 1. 更新提供商基本信息
    db.run(
        `UPDATE providers SET name = ?, url = ?, website = ?, api_key = ? WHERE id = ?`,
        [name, url, website || '', mainApiKey, providerId],
        function(/** @type {any} */ err) {
            if (err) {
                logger.error('更新提供商失败:', err.message);
                return res.redirect(`/edit-provider/${providerId}?error=` + encodeURIComponent('更新提供商失败: ' + err.message));
            }

            // 2. 处理API密钥 (api_keys表) - 加密存储
            if (Array.isArray(apiKeys)) {
                apiKeys.forEach((key, index) => {
                    const keyId = keyIds ? keyIds[index] : null;
                    const kname = `密钥 ${index + 1}`;
                    if (key && key.trim() !== '') {
                        try {
                            // 加密API密钥
                            const encryptedKey = encryptionService.encrypt(key);
                            const encryptedKeyJson = JSON.stringify(encryptedKey);
                            
                            if (keyId) {
                                db.run(`UPDATE api_keys SET key_name = ?, api_key = ?, is_active = 1 WHERE id = ?`, [kname, encryptedKeyJson, keyId]);
                                logger.info(`[ENCRYPTION] API密钥已加密更新: ${kname}`);
                            } else {
                                db.run(`INSERT INTO api_keys (provider_id, key_name, api_key, is_active) VALUES (?, ?, ?, 1)`, [providerId, kname, encryptedKeyJson]);
                                logger.info(`[ENCRYPTION] API密钥已加密保存: ${kname}`);
                            }
                        } catch (/** @type {any} */ error) {
                            logger.error(`[ENCRYPTION] 加密API密钥失败: ${error.message}`);
                            // 如果加密失败，仍然保存明文（不推荐，但确保系统可用）
                            if (keyId) {
                                db.run(`UPDATE api_keys SET key_name = ?, api_key = ?, is_active = 1 WHERE id = ?`, [kname, key, keyId]);
                            } else {
                                db.run(`INSERT INTO api_keys (provider_id, key_name, api_key, is_active) VALUES (?, ?, ?, 1)`, [providerId, kname, key]);
                            }
                        }
                    }
                });
            }

            // 3. 处理API接口地址 (api_endpoints表)
            if (Array.isArray(endpoints)) {
                endpoints.forEach((endpointUrl, index) => {
                    const endpointId = endpointIds ? endpointIds[index] : null;
                    const ename = `接口 ${index + 1}`;
                    if (endpointUrl && endpointUrl.trim() !== '') {
                        if (endpointId) {
                            db.run(`UPDATE api_endpoints SET endpoint_name = ?, endpoint_url = ?, is_active = 1 WHERE id = ?`, [ename, endpointUrl, endpointId]);
                        } else {
                            db.run(`INSERT INTO api_endpoints (provider_id, endpoint_name, endpoint_url, is_active) VALUES (?, ?, ?, 1)`, [providerId, ename, endpointUrl]);
                        }
                    }
                });
            }

            logOperation(db, 'UPDATE', 'provider', providerId, name, `更新提供商信息: ${name}`, 'success', req);
            res.redirect('/?success=' + encodeURIComponent(`提供商 ${name} 已成功更新`));
        }
    );
});

// 删除提供商路由
router.post('/delete-provider/:id', (req, res) => {
    const db = req.app?.locals?.db || /** @type {any} */ (globalThis).db;
    const providerId = req.params.id;

    // 先获取提供商名称，用于显示消息
    db.get(`SELECT name FROM providers WHERE id = ?`, [providerId], (/** @type {any} */ err, /** @type {any} */ provider) => {
        if (err) {
            logger.error('查询提供商错误:', err);
            return res.redirect('/?error=' + encodeURIComponent('查询提供商时发生错误: ' + err.message));
        }

        if (!provider) {
            return res.redirect('/?error=' + encodeURIComponent('未找到指定的提供商'));
        }

        // 先删除该提供商的所有模型
        db.run(`DELETE FROM models WHERE provider_id = ?`, [providerId], (/** @type {any} */ err) => {
            if (err) {
                logger.error('删除提供商模型失败:', err);
                return res.redirect('/?error=' + encodeURIComponent('删除提供商模型时发生错误: ' + err.message));
            }

            // 然后删除提供商
            db.run(`DELETE FROM providers WHERE id = ?`, [providerId], (/** @type {any} */ err) => {
                if (err) {
                    logger.error('删除提供商失败:', err);
                    return res.redirect('/?error=' + encodeURIComponent('删除提供商时发生错误: ' + err.message));
                }

                const successMsg = `提供商 ${provider.name} 及其所有模型已成功删除`;
                logOperation(db, 'DELETE', 'provider', providerId, provider.name, `删除提供商及其所有模型: ${provider.name}`, 'success', req);
                res.redirect('/?success=' + encodeURIComponent(successMsg));
            });
        });
    });
});

// 检测单个提供商的模型
async function detectModelsForProvider(/** @type {any} */ provider, db = /** @type {any} */ (globalThis).db) {
    try {
        logger.info(`🔄 开始检测提供商: ${provider.name}`);
        
        // 检查是否有多个API密钥
        const hasMultipleKeys = await new Promise((resolve) => {
            db.get(`
                SELECT COUNT(*) as count FROM api_keys
                WHERE provider_id = ? AND is_active = 1
            `, [provider.id], (/** @type {any} */ err, /** @type {{ count: number }} */ row) => {
                if (err) {
                    logger.error(`检查提供商${provider.name}的API密钥失败:`, err.message);
                    resolve(false);
                } else {
                    resolve(row.count > 1);
                }
            });
        });
        
        // 根据是否有多个密钥选择不同的分析器
        /** @type {any} */
        const analyzer = hasMultipleKeys 
            ? new (/** @type {any} */ (ModelAnalyzerEnhanced))(provider)
            : new (/** @type {any} */ (ModelAnalyzer))(provider);
            
        // 如果有多个密钥，设置智能轮换策略
        if (hasMultipleKeys) {
            analyzer.setRotationStrategy('smart'); // 使用智能轮换策略
            analyzer.setMaxRequestsPerKey(30); // 每个密钥最大30个请求
        }
            
        const models = await analyzer.detectModels();

        // 模型去重
        const uniqueModels = [];
        const modelIds = new Set();
        
        for (const model of models) {
            if (!modelIds.has(model.id)) {
                modelIds.add(model.id);
                uniqueModels.push(model);
            }
        }
        
        logger.info(`去重后剩余 ${uniqueModels.length} 个模型 (原 ${models.length} 个)`);

        // 清除旧模型记录
        await new Promise((/** @type {(value?: void) => void} */ resolve) => {
            db.run(`DELETE FROM models WHERE provider_id = ?`, [provider.id], () => resolve());
        });

        // 插入新模型记录
        const stmt = db.prepare(`INSERT INTO models (provider_id, model_name, model_id, description, category, context_window, capabilities) VALUES (?, ?, ?, ?, ?, ?, ?)`);

        for (const model of uniqueModels) {
            const capabilitiesJson = model.capabilities ? JSON.stringify(model.capabilities) : null;
            stmt.run([
                provider.id,
                model.name,
                model.id,
                model.description || null,
                model.category || null,
                model.context || null,
                capabilitiesJson
            ]);
        }

        stmt.finalize();

        // 记录操作日志
        logOperation(db, 'DETECT_MODELS', 'provider', provider.id, provider.name,
                    `为提供商 ${provider.name} 检测到 ${uniqueModels.length} 个模型`, 'success', null);

        return uniqueModels;
    } catch (/** @type {any} */ error) {
        logger.error(`检测提供商 ${provider.name} 的模型失败:`, error);
        if (error.response) {
            logger.error(`响应状态: ${error.response.status}`);
            logger.error(`响应数据:`, JSON.stringify(error.response.data));
        }
        logOperation(db, 'DETECT_MODELS', 'provider', provider.id, provider.name,
                    `检测提供商 ${provider.name} 的模型失败: ${error.message}`, 'error', null);
        throw error;
    }
}

// 自动检测所有提供商的模型
async function autoDetectAllModels(db = /** @type {any} */ (globalThis).db) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT id, name, url, api_key FROM providers`, async (/** @type {any} */ err, /** @type {any[]} */ providers) => {
            if (err) {
                return reject(err);
            }

            if (providers.length === 0) {
                logger.info('没有找到任何提供商，跳过模型检测');
                return resolve([]);
            }

            logger.info(`开始自动检测 ${providers.length} 个提供商的模型...`);
            const allModels = [];

            for (const provider of providers) {
                try {
                    const models = await detectModelsForProvider(provider, db);
                    allModels.push(...models);
                } catch (/** @type {any} */ error) {
                    logger.error(`检测提供商 ${provider.name} 的模型时出错:`, error.message);
                    // 继续处理其他提供商
                }
            }

            logger.info(`✅ 自动检测完成，共检测到 ${allModels.length} 个模型`);
            resolve(allModels);
        });
    });
}

// 检测单个提供商的模型（路由版本）
router.post('/detect-models/:id', async (req, res) => {
    const providerId = req.params.id;
    const db = req.app?.locals?.db || /** @type {any} */ (globalThis).db;

    // 获取提供商信息
    db.get(`SELECT id, name, url, api_key FROM providers WHERE id = ?`, [providerId], (/** @type {any} */ err, /** @type {any} */ provider) => {
        if (err) {
            logger.error('查询提供商错误:', err);
            return res.status(500).json({ error: '查询提供商时发生错误: ' + err.message });
        }

        if (!provider) {
            return res.status(404).json({ error: '未找到指定的提供商' });
        }

        // 检测模型
        detectModelsForProvider(provider, db)
            .then(models => {
                res.json({
                    success: true,
                    message: `检测完成，共发现 ${models.length} 个模型`,
                    count: models.length,
                    models: models
                });
            })
            .catch(error => {
                logger.error(`检测提供商 ${provider.name} 的模型失败:`, error);
                res.status(500).json({
                    success: false,
                    message: `检测失败: ${error.message}`
                });
            });
    });
});

// 测试提供商连接（新增）
router.post('/test-connection/:id', async (req, res) => {
    const providerId = req.params.id;
    const db = req.app?.locals?.db || /** @type {any} */ (globalThis).db;

    try {
        // 获取提供商信息
        const provider = await new Promise((resolve, reject) => {
            db.get(`SELECT id, name, url FROM providers WHERE id = ?`, [providerId], (/** @type {any} */ err, /** @type {any} */ row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });

        if (!provider) {
            return res.status(404).json({
                success: false,
                message: '未找到指定的提供商'
            });
        }

        const startTime = Date.now();
        let checkUrl = provider.url.trim();
        if (checkUrl.endsWith('/')) checkUrl = checkUrl.slice(0, -1);

        // 智能处理检测URL
        if (checkUrl.toLowerCase().includes('/models') || checkUrl.toLowerCase().includes('/list')) {
            // 保持原样
        } else if (checkUrl.toLowerCase().includes('bigmodel.cn')) {
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

        // 清理重复路径
        checkUrl = checkUrl.replace(/([^:])\/\/+/g, '$1/');
        checkUrl = checkUrl.replace(/\/api\/api/gi, '/api');

        logger.info(`[Connection Test] 测试提供商 ${provider.name}: ${checkUrl}`);

        // 发送测试请求
        /** @type {any} */
        const headers = {};
        // 获取第一个可用的API密钥
        const apiKey = await new Promise(resolve => {
            db.get(`SELECT api_key FROM api_keys WHERE provider_id = ? AND is_active = 1 LIMIT 1`,
                [providerId],
                (/** @type {any} */ err, /** @type {{ api_key: string }} */ row) => {
                    if (err || !row) {
                        resolve(null);
                        return;
                    }
                    try {
                        const encrypted = JSON.parse(row.api_key);
                        resolve(encryptionService.decrypt(encrypted));
                    } catch {
                        resolve(null);
                    }
                });
        });

        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const axios = (await import('axios')).default;
        const response = await axios.get(checkUrl, {
            timeout: 10000,
            headers: headers,
            validateStatus: (status) => status < 500
        });

        const responseTime = Date.now() - startTime;

        // 记录测试日志
        logOperation(db, 'TEST_CONNECTION', 'provider', provider.id, provider.name,
                    `测试连接 - 响应时间: ${responseTime}ms, 状态码: ${response.status}`, response.status < 400 ? 'success' : 'error', req);

        res.json({
            success: true,
            message: '连接成功',
            data: {
                response_time: responseTime,
                status_code: response.status,
                server: response.headers?.server || 'Unknown'
            }
        });

    } catch (/** @type {any} */ error) {
        logger.error(`测试提供商连接失败:`, error.message);

        // 记录失败日志
        db.get(`SELECT name FROM providers WHERE id = ?`, [providerId], (/** @type {any} */ err, /** @type {{ name: string }} */ row) => {
            if (!err && row) {
                logOperation(db, 'TEST_CONNECTION', 'provider', providerId, row.name,
                            `测试连接失败: ${error.message}`, 'error', req);
            }
        });

        let errorType = 'unknown';
        if (error.code === 'ECONNABORTED') {
            errorType = 'timeout';
        } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            errorType = 'connection';
        }

        res.json({
            success: false,
            message: error.message || '连接失败',
            error_type: errorType,
            response_time: error.responseTime || null
        });
    }
});

// 批量测试所有提供商连接
router.post('/test-all-connections', async (req, res) => {
    const db = req.app?.locals?.db || /** @type {any} */ (globalThis).db;

    try {
        const providers = await new Promise((resolve, reject) => {
            db.all(`SELECT id, name, url FROM providers`, (/** @type {any} */ err, /** @type {any[]} */ rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });

        if (providers.length === 0) {
            return res.json({
                success: true,
                message: '没有提供商可测试',
                results: []
            });
        }

        const results = [];

        for (const provider of providers) {
            try {
                const startTime = Date.now();
                let checkUrl = provider.url.trim();
                if (checkUrl.endsWith('/')) checkUrl = checkUrl.slice(0, -1);

                // 智能处理检测URL
                if (!checkUrl.toLowerCase().includes('/models') && !checkUrl.toLowerCase().includes('/list')) {
                    if (checkUrl.toLowerCase().includes('bigmodel.cn')) {
                        if (!checkUrl.toLowerCase().includes('/api/paas/v4')) {
                            checkUrl = `${checkUrl}/api/paas/v4/models`;
                        } else {
                            checkUrl = `${checkUrl}/models`;
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

                checkUrl = checkUrl.replace(/([^:])\/\/+/g, '$1/');
                checkUrl = checkUrl.replace(/\/api\/api/gi, '/api');

                /** @type {any} */
                const headers = {};
                const apiKey = await new Promise(resolve => {
                    db.get(`SELECT api_key FROM api_keys WHERE provider_id = ? AND is_active = 1 LIMIT 1`,
                        [provider.id],
                        (/** @type {any} */ err, /** @type {{ api_key: string }} */ row) => {
                            if (err || !row) {
                                resolve(null);
                                return;
                            }
                            try {
                                const encrypted = JSON.parse(row.api_key);
                                resolve(encryptionService.decrypt(encrypted));
                            } catch {
                                resolve(null);
                            }
                        });
                });

                if (apiKey) {
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }

                const axios = (await import('axios')).default;
                const response = await axios.get(checkUrl, {
                    timeout: 10000,
                    headers: headers,
                    validateStatus: (status) => status < 500
                });

                results.push({
                    id: provider.id,
                    name: provider.name,
                    status: 'success',
                    response_time: Date.now() - startTime,
                    status_code: response.status
                });

            } catch (/** @type {any} */ error) {
                results.push({
                    id: provider.id,
                    name: provider.name,
                    status: 'failed',
                    error: error.message
                });
            }
        }

        const successCount = results.filter(r => r.status === 'success').length;

        res.json({
            success: true,
            message: `测试完成，${successCount}/${providers.length} 个提供商可用`,
            results: results
        });

    } catch (/** @type {any} */ error) {
        res.status(500).json({
            success: false,
            message: '批量测试失败: ' + error.message
        });
    }
});

export { router as default, detectModelsForProvider, autoDetectAllModels };
