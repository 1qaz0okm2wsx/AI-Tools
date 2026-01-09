
// 数据库模式更新模块
import { logger } from './src/utils/logger.js';

// 更新数据库结构以支持多个API密钥
/**
 * @param {any} db - 数据库实例
 */
function updateDatabaseSchema(db) {
    // 检查是否需要更新数据库结构
    db.get(`PRAGMA table_info(providers)`, (/** @type {any} */ err, /** @type {any} */ _columns) => {
        if (err) {
            logger.error('获取表结构失败:', err);
            return;
        }

        // 检查是否已有多密钥支持
        const hasMultipleKeys = _columns.some((/** @type {any} */ col) => col.name === 'is_primary');

        if (!hasMultipleKeys) {
            logger.info('检测到旧版数据库结构，开始更新...');

            // 1. 添加新列
            db.run(`ALTER TABLE providers ADD COLUMN is_primary BOOLEAN DEFAULT 1`, (/** @type {any} */ addErr) => {
                if (addErr) {
                    logger.error('添加is_primary列失败:', addErr);
                    return;
                }

                logger.info('✅ 添加is_primary列成功');

                // 2. 创建API密钥表
                db.run(`CREATE TABLE IF NOT EXISTS api_keys (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    provider_id INTEGER NOT NULL,
                    key_name TEXT NOT NULL,
                    api_key TEXT NOT NULL,
                    is_active BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (provider_id) REFERENCES providers (id) ON DELETE CASCADE
                )`, (/** @type {any} */ createErr) => {
                    if (createErr) {
                        logger.error('创建api_keys表失败:', createErr);
                        return;
                    }

                    logger.info('✅ 创建api_keys表成功');

                    // 3. 添加索引
                    db.run(`CREATE INDEX IF NOT EXISTS idx_api_keys_provider_id ON api_keys(provider_id)`);
                    db.run(`CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active)`);

                    logger.info('✅ 添加索引成功');

                    // 4. 迁移现有API密钥
                    migrateExistingApiKeys(db);
                });
            });
        }

        // 检查是否存在website列
        const hasWebsite = _columns.some((/** @type {any} */ col) => col.name === 'website');
        if (!hasWebsite) {
            logger.info('添加website列到providers表...');
            db.run(`ALTER TABLE providers ADD COLUMN website TEXT`, (/** @type {any} */ websiteErr) => {
                if (websiteErr) {
                    logger.error('添加website列失败:', websiteErr);
                } else {
                    logger.info('✅ 添加website列成功');
                }
            });
        }
    });
}

// 迁移现有API密钥到新表
/**
 * @param {any} db - 数据库实例
 */
function migrateExistingApiKeys(db) {
    // 获取所有有API密钥的提供商
    db.all(`SELECT id, name, api_key FROM providers WHERE api_key IS NOT NULL AND api_key != ''`, (/** @type {any} */ err, /** @type {any} */ _providers) => {
        if (err) {
            logger.error('获取提供商失败:', err);
            return;
        }

        if (_providers.length === 0) {
            logger.info('没有需要迁移的API密钥');
            return;
        }

        logger.info(`开始迁移${_providers.length}个提供商的API密钥...`);

        // 为每个提供商创建API密钥记录
        let completed = 0;

        _providers.forEach((/** @type {any} */ provider) => {
            db.run(`INSERT INTO api_keys (provider_id, key_name, api_key) VALUES (?, ?, ?)`,
                [provider.id, '默认密钥', provider.api_key],
                function(/** @type {any} */ _err) {
                    if (_err) {
                        logger.error(`迁移提供商${provider.name}的API密钥失败:`, _err);
                    } else {
                        logger.info(`✅ 成功迁移提供商${provider.name}的API密钥`);
                    }

                    completed++;

                    // 所有迁移完成后，清空原API密钥列
                    if (completed === _providers.length) {
                        db.run(`UPDATE providers SET api_key = NULL`, (/** @type {any} */ clearErr) => {
                            if (clearErr) {
                                logger.error('清空原API密钥列失败:', clearErr);
                            } else {
                                logger.info('✅ API密钥迁移完成');
                            }
                        });
                    }
                }
            );
        });
    });
}

export { updateDatabaseSchema };
