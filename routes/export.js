/**
 * 导出路由 (ESM)
 */

import express from 'express';

const router = express.Router();

// 导出为JSON
router.get('/export/json', (req, res) => {
    const db = req.app?.locals?.db || /** @type {any} */ (globalThis).db;

    db.all(`SELECT p.*, 
        (SELECT GROUP_CONCAT(api_key, ',') FROM api_keys WHERE provider_id = p.id) as api_keys
        FROM providers p`, (/** @type {Error | null} */ err, /** @type {any[]} */ providers) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        // 获取每个提供商的模型
        const promises = providers.map(provider => {
            return new Promise((resolve, reject) => {
                db.all(`SELECT * FROM models WHERE provider_id = ?`, [provider.id], (/** @type {any} */ err, /** @type {any[]} */ models) => {
                    if (err) return reject(err);
                    resolve({ ...provider, models: models || [] });
                });
            });
        });

        Promise.all(promises)
            .then(data => {
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', 'attachment; filename=ai-providers.json');
                res.json(data);
            })
            .catch(error => {
                res.status(500).json({ error: error.message });
            });
    });
});

// 导出为CSV
router.get('/export/csv', (req, res) => {
    const db = req.app?.locals?.db || /** @type {any} */ (globalThis).db;

    db.all(`SELECT * FROM providers`, (/** @type {Error | null} */ err, /** @type {any[]} */ providers) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        const csv = [
            'ID,Name,URL,Website,Created At',
            ...providers.map(p => `${p.id},${p.name},${p.url},${p.website || ''},${p.created_at}`)
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=ai-providers.csv');
        res.send(csv);
    });
});

export default router;
