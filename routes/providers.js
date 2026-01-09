
/**
 * 提供商管理路由 (ESM)
 */

import express from 'express';
import ModelAnalyzer from '../modelAnalyzer.js';
import ModelAnalyzerEnhanced from '../modelAnalyzer_enhanced.js';
import { logOperation } from '../db_init.js';
import { getAvailableApiKey } from './api_keys.js';

const router = express.Router();

// 添加提供商路由
router.post('/add-provider', (req, res) => {
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
    let keys = [];
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
    let endpointUrls = [];
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
    const defaultEndpointIndex = parseInt(defaultEndpoint) || 0;

    // 插入提供商
    global.db.run(
        `INSERT INTO providers (name, url, website, api_key) VALUES (?, ?, ?, ?)`,
        [name, url, website || '', mainApiKey],
        function(err) {
            if (err) {
                console.error('添加提供商失败:', err.message);
                return res.status(500).json({ error: '添加提供商失败: ' + err.message });
            }

            const providerId = this.lastID;

            // 保存所有密钥到api_keys表
            if (keys.length > 0) {
                const stmt = global.db.prepare(`INSERT INTO api_keys (provider_id, key_name, api_key, is_active) VALUES (?, ?, ?, 1)`);
                keys.forEach((key, index) => {
                    stmt.run([providerId, names[index] || `密钥 ${index + 1}`, key]);
                });
                stmt.finalize();
            }

            // 保存所有API接口地址到api_endpoints表
            if (endpointUrls.length > 0) {
                const stmt = global.db.prepare(`INSERT INTO api_endpoints (provider_id, endpoint_url, endpoint_name, is_active) VALUES (?, ?, ?, 1)`);
                endpointUrls.forEach((endpointUrl, index) => {
                    stmt.run([providerId, endpointUrl, endpointNameList[index] || `接口 ${index + 1}`]);
                });
                stmt.finalize();
            }

            // 记录操作日志
            logOperation(global.db, 'CREATE', 'provider', providerId, name, `添加提供商: ${name}，共添加${keys.length}个API密钥和${endpointUrls.length}个API接口`, 'success', req);

            // 自动检测模型
            const provider = {
                id: providerId,
                name: name,
                url: url,
                api_key: mainApiKey
            };

            detectModelsForProvider(provider)
                .then(models => {
                    console.log(`✅ 成功为提供商 ${name} 检测到 ${models.length} 个模型`);
                    res.redirect('/?success=' + encodeURIComponent(`提供商 ${name} 已添加，检测到 ${models.length} 个模型`));
                })
                .catch(error => {
                    console.error(`❌ 为提供商 ${name} 检测模型失败:`, error.message);
                    res.redirect('/?success=' + encodeURIComponent(`提供商 ${name} 已添加，但模型检测失败: ${error.message}`));
                });
        }
    );
});

// 编辑提供商页面
router.get('/edit-provider/:id', (req, res) => {
    const providerId = req.params.id;

    global.db.get(`SELECT * FROM providers WHERE id = ?`, [providerId], (err, provider) => {
        if (err) {
            console.error('查询提供商错误:', err);
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
    const providerId = req.params.id;
    let { name, url, website, apiKeys, keyNames, keyIds, defaultKey, endpoints, endpointNames, endpointIds } = req.body;

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
    global.db.run(
        `UPDATE providers SET name = ?, url = ?, website = ?, api_key = ? WHERE id = ?`,
        [name, url, website || '', mainApiKey, providerId],
        function(err) {
            if (err) {
                console.error('更新提供商失败:', err.message);
                return res.redirect(`/edit-provider/${providerId}?error=` + encodeURIComponent('更新提供商失败: ' + err.message));
            }

            // 2. 处理API密钥 (api_keys表)
            if (Array.isArray(apiKeys)) {
                apiKeys.forEach((key, index) => {
                    const keyId = keyIds ? keyIds[index] : null;
                    const kname = `密钥 ${index + 1}`;
                    if (key && key.trim() !== '') {
                        if (keyId) {
                            global.db.run(`UPDATE api_keys SET key_name = ?, api_key = ?, is_active = 1 WHERE id = ?`, [kname, key, keyId]);
                        } else {
                            global.db.run(`INSERT INTO api_keys (provider_id, key_name, api_key, is_active) VALUES (?, ?, ?, 1)`, [providerId, kname, key]);
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
                            global.db.run(`UPDATE api_endpoints SET endpoint_name = ?, endpoint_url = ?, is_active = 1 WHERE id = ?`, [ename, endpointUrl, endpointId]);
                        } else {
                            global.db.run(`INSERT INTO api_endpoints (provider_id, endpoint_name, endpoint_url, is_active) VALUES (?, ?, ?, 1)`, [providerId, ename, endpointUrl]);
                        }
                    }
                });
            }

            logOperation(global.db, 'UPDATE', 'provider', providerId, name, `更新提供商信息: ${name}`, 'success', req);
            res.redirect('/?success=' + encodeURIComponent(`提供商 ${name} 已成功更新`));
        }
    );
});

// 删除提供商路由
router.post('/delete-provider/:id', (req, res) => {
    const providerId = req.params.id;

    // 先获取提供商名称，用于显示消息
    global.db.get(`SELECT name FROM providers WHERE id = ?`, [providerId], (err, provider) => {
        if (err) {
            console.error('查询提供商错误:', err);
            return res.redirect('/?error=' + encodeURIComponent('查询提供商时发生错误: ' + err.message));
        }

        if (!provider) {
            return res.redirect('/?error=' + encodeURIComponent('未找到指定的提供商'));
        }

        // 先删除该提供商的所有模型
        global.db.run(`DELETE FROM models WHERE provider_id = ?`, [providerId], (err) => {
            if (err) {
                console.error('删除提供商模型失败:', err);
                return res.redirect('/?error=' + encodeURIComponent('删除提供商模型时发生错误: ' + err.message));
            }

            // 然后删除提供商
            global.db.run(`DELETE FROM providers WHERE id = ?`, [providerId], (err) => {
                if (err) {
                    console.error('删除提供商失败:', err);
                    return res.redirect('/?error=' + encodeURIComponent('删除提供商时发生错误: ' + err.message));
                }

                const successMsg = `提供商 ${provider.name} 及其所有模型已成功删除`;
                logOperation(global.db, 'DELETE', 'provider', providerId, provider.name, `删除提供商及其所有模型: ${provider.name}`, 'success', req);
                res.redirect('/?success=' + encodeURIComponent(successMsg));
            });
        });
    });
});

// 检测单个提供商的模型
async function detectModelsForProvider(provider) {
    try {
        console.log(`🔄 开始检测提供商: ${provider.name}`);
        
        // 检查是否有多个API密钥
        const hasMultipleKeys = await new Promise((resolve) => {
            global.db.get(`
                SELECT COUNT(*) as count FROM api_keys
                WHERE provider_id = ? AND is_active = 1
            `, [provider.id], (err, row) => {
                if (err) {
                    console.error(`检查提供商${provider.name}的API密钥失败:`, err.message);
                    resolve(false);
                } else {
                    resolve(row.count > 1);
                }
            });
        });
        
        // 根据是否有多个密钥选择不同的分析器
        const analyzer = hasMultipleKeys 
            ? new ModelAnalyzerEnhanced(provider)
            : new ModelAnalyzer(provider);
            
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
        
        console.log(`去重后剩余 ${uniqueModels.length} 个模型 (原 ${models.length} 个)`);

        // 清除旧模型记录
        await new Promise((res) => {
            global.db.run(`DELETE FROM models WHERE provider_id = ?`, [provider.id], () => res());
        });

        // 插入新模型记录
        const stmt = global.db.prepare(`INSERT INTO models (provider_id, model_name, model_id, description, category, context_window, capabilities) VALUES (?, ?, ?, ?, ?, ?, ?)`);

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
        logOperation(global.db, 'DETECT_MODELS', 'provider', provider.id, provider.name,
                    `为提供商 ${provider.name} 检测到 ${uniqueModels.length} 个模型`, 'success', null);

        return uniqueModels;
    } catch (error) {
        console.error(`检测提供商 ${provider.name} 的模型失败:`, error);
        if (error.response) {
            console.error(`响应状态: ${error.response.status}`);
            console.error(`响应数据:`, JSON.stringify(error.response.data));
        }
        logOperation(global.db, 'DETECT_MODELS', 'provider', provider.id, provider.name,
                    `检测提供商 ${provider.name} 的模型失败: ${error.message}`, 'error', null);
        throw error;
    }
}

// 自动检测所有提供商的模型
async function autoDetectAllModels() {
    return new Promise((resolve, reject) => {
        global.db.all(`SELECT id, name, url, api_key FROM providers`, async (err, providers) => {
            if (err) {
                return reject(err);
            }

            if (providers.length === 0) {
                console.log('没有找到任何提供商，跳过模型检测');
                return resolve([]);
            }

            console.log(`开始自动检测 ${providers.length} 个提供商的模型...`);
            const allModels = [];

            for (const provider of providers) {
                try {
                    const models = await detectModelsForProvider(provider);
                    allModels.push(...models);
                } catch (error) {
                    console.error(`检测提供商 ${provider.name} 的模型时出错:`, error.message);
                    // 继续处理其他提供商
                }
            }

            console.log(`✅ 自动检测完成，共检测到 ${allModels.length} 个模型`);
            resolve(allModels);
        });
    });
}

export { router as default, detectModelsForProvider, autoDetectAllModels };
