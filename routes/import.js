/**
 * 导入路由 (ESM)
 */

import express from 'express';
import { logOperation } from '../db_init.js';
import { logger } from '../src/utils/logger.js';

const router = express.Router();

// 导入JSON
router.post('/import/json', (req, res) => {
    const db = req.app?.locals?.db || /** @type {any} */ (globalThis).db;
    const data = req.body;

    if (!Array.isArray(data)) {
        return res.status(400).json({
            success: false,
            error: '必须提供提供商数组'
        });
    }

    let imported = 0;
    let errors = 0;
    const providers = /** @type {any[]} */ (data);

    const importProvider = (/** @type {number} */ index) => {
        if (index >= providers.length) {
            // 完成导入
            logOperation(db, 'IMPORT', 'system', null, 'system',
                        `JSON导入完成，成功导入 ${imported} 个提供商，${errors} 个错误`, 'success', req);

            res.json({
                success: true,
                message: `导入完成`,
                imported,
                errors
            });
            return;
        }

        const provider = providers[index];
        const { name, url, website, api_key } = provider;

        db.run(
            `INSERT INTO providers (name, url, website, api_key) VALUES (?, ?, ?, ?)`,
            [name || `提供商 ${new Date().toLocaleString('zh-CN')}`, url, website || '', api_key || ''],
            /** @this {{ lastID: number }} */
            function(/** @type {any} */ err) {
                if (err) {
                    logger.error(`导入提供商 ${name || index} 失败:`, err.message);
                    errors++;
                } else {
                    imported++;
                }

                // 导入其模型
                if (provider.models && Array.isArray(provider.models)) {
                    const stmt = db.prepare(`INSERT INTO models (provider_id, model_id, model_name, description) VALUES (?, ?, ?, ?)`);
                    provider.models.forEach((/** @type {any} */ model) => {
                        stmt.run([this.lastID, model.model_id, model.model_name, model.description]);
                    });
                    stmt.finalize();
                }

                // 处理下一个
                importProvider(index + 1);
            }
        );
    };

    importProvider(0);
});

// 导入CSV
router.post('/import/csv', (req, res) => {
    const db = req.app?.locals?.db || /** @type {any} */ (globalThis).db;
    const csvData = req.body;

    if (typeof csvData !== 'string') {
        return res.status(400).json({
            success: false,
            error: '必须提供CSV格式的文本'
        });
    }

    try {
        const lines = csvData.trim().split('\n');
        lines[0].split(',');

        let imported = 0;
        let errors = 0;

        const importRow = (/** @type {number} */ index) => {
            if (index >= lines.length) {
                logOperation(db, 'IMPORT', 'system', null, 'system',
                            `CSV导入完成，成功导入 ${imported} 个提供商，${errors} 个错误`, 'success', req);

                res.json({
                    success: true,
                    message: `导入完成`,
                    imported,
                    errors
                });
                return;
            }

            const values = lines[index].split(',');
            if (values.length < 2) {
                errors++;
                importRow(index + 1);
                return;
            }

            const name = values[1]?.trim();
            const url = values[2]?.trim();
            const website = values[3]?.trim() || '';
            const api_key = '';

            if (!name || !url) {
                errors++;
                importRow(index + 1);
                return;
            }

            db.run(
                `INSERT INTO providers (name, url, website, api_key) VALUES (?, ?, ?, ?)`,
                [name, url, website, api_key],
                function(/** @type {any} */ err) {
                    if (err) {
                        logger.error(`导入提供商 ${name} 失败:`, err.message);
                        errors++;
                    } else {
                        imported++;
                    }
                    importRow(index + 1);
                }
            );
        };

        importRow(1); // 跳过标题行

    } catch (error) {
        res.status(500).json({
            success: false,
            error: `解析CSV失败: ${error instanceof Error ? error.message : String(error)}`
        });
    }
});

export default router;
