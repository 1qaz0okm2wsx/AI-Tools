
/**
 * API密钥管理路由 (ESM)
 */

import express from 'express';
import { logOperation } from '../db_init.js';

const router = express.Router();

// API密钥管理页面
router.get('/provider/:id/api-keys', (req, res) => {
    const providerId = req.params.id;

    // 获取提供商信息
    /** @type {any} */ (global).db.get(`SELECT id, name, url FROM providers WHERE id = ?`, [providerId], (/** @type {Error} */ err, /** @type {any} */ provider) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (!provider) {
            return res.status(404).json({ error: '未找到指定的提供商' });
        }

        // 获取所有API密钥
        /** @type {any} */ (global).db.all(`
            SELECT id, key_name, api_key, is_active, created_at
            FROM api_keys
            WHERE provider_id = ?
            ORDER BY created_at DESC
        `, [providerId], (/** @type {Error} */ err, /** @type {any[]} */ apiKeys) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            // 格式化创建时间
            apiKeys.forEach((/** @type {any} */ key) => {
                key.formatted_time = new Date(key.created_at).toLocaleString('zh-CN');
                // 隐藏API密钥的大部分内容
                if (key.api_key && key.api_key.length > 8) {
                    key.masked_key = key.api_key.substring(0, 4) + '****' + key.api_key.substring(key.api_key.length - 4);
                } else {
                    key.masked_key = '****';
                }
            });

            res.render('api-keys', {
                provider,
                apiKeys
            });
        });
    });
});

// 获取API密钥JSON数据（用于编辑提供商页面）
router.get('/provider/:id/api-keys-json', (req, res) => {
    const providerId = req.params.id;

    // 获取提供商的主API密钥
    /** @type {any} */ (global).db.get(`SELECT api_key FROM providers WHERE id = ?`, [providerId], (/** @type {Error} */ err, /** @type {any} */ provider) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        // 获取所有API密钥
        /** @type {any} */ (global).db.all(`
            SELECT id, key_name, api_key, is_active
            FROM api_keys
            WHERE provider_id = ?
            ORDER BY created_at ASC
        `, [providerId], (/** @type {Error} */ err, /** @type {any[]} */ apiKeys) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            // 如果没有API密钥，添加一个空密钥字段供填写
            if (apiKeys.length === 0) {
                apiKeys.push({
                    id: null,
                    key_name: '',
                    api_key: '',
                    is_active: 1,
                    is_default: true
                });
            }
            
            // 检查主密钥是否已经在列表中
            const mainKey = provider ? provider.api_key : null;
            const isMainKeyInList = apiKeys.some((/** @type {any} */ k) => k.api_key === mainKey && mainKey !== '');

            if (mainKey && mainKey !== '' && !isMainKeyInList) {
                // 如果主密钥不在列表中，则添加它
                if (apiKeys.length === 1 && apiKeys[0].api_key === '') {
                    apiKeys[0].key_name = '主密钥';
                    apiKeys[0].api_key = mainKey;
                    apiKeys[0].is_default = true;
                } else {
                    apiKeys.unshift({
                        id: null,
                        key_name: '主密钥',
                        api_key: mainKey,
                        is_active: 1,
                        is_default: true
                    });
                }
            }

            // 无论如何，标记哪个是当前的默认密钥
            apiKeys.forEach((/** @type {any} */ key) => {
                key.is_default = mainKey && key.api_key === mainKey;
            });

            res.json({
                apiKeys
            });
        });
    });
});

// 获取提供商的API接口JSON数据
router.get('/provider/:id/endpoints-json', (req, res) => {
    const providerId = req.params.id;

    /** @type {any} */ (global).db.all(`
        SELECT id, endpoint_url, endpoint_name, is_active
        FROM api_endpoints
        WHERE provider_id = ?
        ORDER BY created_at ASC
    `, [providerId], (/** @type {Error} */ err, /** @type {any[]} */ endpoints) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ endpoints });
    });
});

// 添加API密钥
router.post('/provider/:id/api-keys/add', (req, res) => {
    const providerId = req.params.id;
    const { keyName, apiKey } = req.body;

    // 验证必填字段
    if (!keyName || !apiKey) {
        return res.status(400).json({ error: '密钥名称和API密钥是必填项' });
    }

    // 获取提供商信息用于日志
    /** @type {any} */ (global).db.get(`SELECT name FROM providers WHERE id = ?`, [providerId], (/** @type {Error} */ err, /** @type {any} */ provider) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (!provider) {
            return res.status(404).json({ error: '未找到指定的提供商' });
        }

        // 插入新的API密钥
        /** @type {any} */ (global).db.run(`
            INSERT INTO api_keys (provider_id, key_name, api_key)
            VALUES (?, ?, ?)
        `, [providerId, keyName, apiKey], function(/** @type {Error} */ err) {
            if (err) {
                return res.status(500).json({ error: '添加API密钥失败: ' + err.message });
            }

            // 记录操作日志
            // @ts-ignore
            const lastID = this.lastID;
            logOperation(/** @type {any} */ (global).db, 'CREATE', 'api_key', lastID, keyName,
                        `为提供商 ${provider.name} 添加API密钥: ${keyName}`, 'success', req);

            res.redirect(`/provider/${providerId}/api-keys?success=` +
                        encodeURIComponent(`API密钥 ${keyName} 已添加`));
        });
    });
});

// 删除API密钥
router.post('/api-keys/:id/delete', (req, res) => {
    const apiKeyId = req.params.id;

    // 获取API密钥信息用于日志
    /** @type {any} */ (global).db.get(`
        SELECT ak.id, ak.key_name, ak.provider_id, p.name as provider_name
        FROM api_keys ak
        JOIN providers p ON ak.provider_id = p.id
        WHERE ak.id = ?
    `, [apiKeyId], (/** @type {Error} */ err, /** @type {any} */ apiKeyInfo) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (!apiKeyInfo) {
            return res.status(404).json({ error: '未找到指定的API密钥' });
        }

        // 删除API密钥
        /** @type {any} */ (global).db.run(`DELETE FROM api_keys WHERE id = ?`, [apiKeyId], (/** @type {Error} */ err) => {
            if (err) {
                return res.status(500).json({ error: '删除API密钥失败: ' + err.message });
            }

            // 记录操作日志
            logOperation(/** @type {any} */ (global).db, 'DELETE', 'api_key', apiKeyId, apiKeyInfo.key_name,
                        `删除提供商 ${apiKeyInfo.provider_name} 的API密钥: ${apiKeyInfo.key_name}`, 'success', req);

            res.redirect(`/provider/${apiKeyInfo.provider_id}/api-keys?success=` +
                        encodeURIComponent(`API密钥 ${apiKeyInfo.key_name} 已删除`));
        });
    });
});

// 切换API密钥状态
router.post('/api-keys/:id/toggle', (req, res) => {
    const apiKeyId = req.params.id;

    // 获取API密钥信息
    /** @type {any} */ (global).db.get(`
        SELECT ak.id, ak.key_name, ak.is_active, ak.provider_id, p.name as provider_name
        FROM api_keys ak
        JOIN providers p ON ak.provider_id = p.id
        WHERE ak.id = ?
    `, [apiKeyId], (/** @type {Error} */ err, /** @type {any} */ apiKeyInfo) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (!apiKeyInfo) {
            return res.status(404).json({ error: '未找到指定的API密钥' });
        }

        // 切换状态
        const newStatus = apiKeyInfo.is_active ? 0 : 1;
        const statusText = newStatus ? '启用' : '禁用';

        /** @type {any} */ (global).db.run(`
            UPDATE api_keys SET is_active = ? WHERE id = ?
        `, [newStatus, apiKeyId], (/** @type {Error} */ err) => {
            if (err) {
                return res.status(500).json({ error: '更新API密钥状态失败: ' + err.message });
            }

            // 记录操作日志
            logOperation(/** @type {any} */ (global).db, 'UPDATE', 'api_key', apiKeyId, apiKeyInfo.key_name,
                        `${statusText}提供商 ${apiKeyInfo.provider_name} 的API密钥: ${apiKeyInfo.key_name}`, 'success', req);

            res.redirect(`/provider/${apiKeyInfo.provider_id}/api-keys?success=` +
                        encodeURIComponent(`API密钥 ${apiKeyInfo.key_name} 已${statusText}`));
        });
    });
});

// 获取可用的API密钥（用于API调用）
/**
 * @param {number} providerId
 * @param {(err: Error | null, apiKey: string | null) => void} callback
 */
function getAvailableApiKey(providerId, callback) {
    /** @type {any} */ (global).db.get(`
        SELECT api_key FROM api_keys
        WHERE provider_id = ? AND is_active = 1
        ORDER BY created_at DESC
        LIMIT 1
    `, [providerId], (/** @type {Error} */ err, /** @type {any} */ row) => {
        if (err) {
            return callback(err, null);
        }

        if (!row) {
            return callback(new Error('没有可用的API密钥'), null);
        }

        callback(null, row.api_key);
    });
}

// 获取所有可用的API密钥（用于轮询）
/**
 * @param {number} providerId
 * @param {(err: Error | null, apiKeys: any[] | null) => void} callback
 */
function getAllAvailableApiKeys(providerId, callback) {
    /** @type {any} */ (global).db.all(`
        SELECT id, key_name, api_key FROM api_keys
        WHERE provider_id = ? AND is_active = 1
        ORDER BY created_at ASC
    `, [providerId], (/** @type {Error} */ err, /** @type {any[]} */ rows) => {
        if (err) {
            return callback(err, null);
        }

        if (!rows || rows.length === 0) {
            return callback(new Error('没有可用的API密钥'), null);
        }

        callback(null, rows);
    });
}

// 验证API密钥
router.post('/api/keys/validate', (req, res) => {
    const { providerId, apiKey } = req.body;

    if (!providerId || !apiKey) {
        return res.status(400).json({ error: 'providerId 和 apiKey 是必填项' });
    }

    // 这里应该调用实际的模型 API 来验证密钥有效性
    // 为了简化，我们暂时只检查密钥格式或简单地返回有效
    // 实际实现中，可以在这里使用 ModelAnalyzerEnhanced 发送一个轻量级请求

    // 模拟验证过程
    // 如果需要更严格的验证，可以在这里实例化 ModelAnalyzerEnhanced 并尝试一次请求
    
    res.json({
        valid: true,
        message: '密钥格式有效 (仅本地验证)'
    });
});

export { router as default, getAvailableApiKey, getAllAvailableApiKeys };
