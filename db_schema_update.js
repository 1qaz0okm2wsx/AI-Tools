
// 数据库模式更新模块
import { initializeDatabase, logOperation } from './db_init.js';

// 更新数据库结构以支持多个API密钥
export function updateDatabaseSchema(db) {
    // 检查是否需要更新数据库结构
    db.get(`PRAGMA table_info(providers)`, (err, columns) => {
        if (err) {
            console.error('获取表结构失败:', err);
            return;
        }

        // 检查是否已有多密钥支持
        const hasMultipleKeys = columns.some(col => col.name === 'is_primary');

        if (!hasMultipleKeys) {
            console.log('检测到旧版数据库结构，开始更新...');

            // 1. 添加新列
            db.run(`ALTER TABLE providers ADD COLUMN is_primary BOOLEAN DEFAULT 1`, (err) => {
                if (err) {
                    console.error('添加is_primary列失败:', err);
                    return;
                }

                console.log('✅ 添加is_primary列成功');

                // 2. 创建API密钥表
                db.run(`CREATE TABLE IF NOT EXISTS api_keys (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    provider_id INTEGER NOT NULL,
                    key_name TEXT NOT NULL,
                    api_key TEXT NOT NULL,
                    is_active BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (provider_id) REFERENCES providers (id) ON DELETE CASCADE
                )`, (err) => {
                    if (err) {
                        console.error('创建api_keys表失败:', err);
                        return;
                    }

                    console.log('✅ 创建api_keys表成功');

                    // 3. 添加索引
                    db.run(`CREATE INDEX IF NOT EXISTS idx_api_keys_provider_id ON api_keys(provider_id)`);
                    db.run(`CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active)`);

                    console.log('✅ 添加索引成功');

                    // 4. 迁移现有API密钥
                    migrateExistingApiKeys(db);
                });
            });
        }

        // 检查是否存在website列
        const hasWebsite = columns.some(col => col.name === 'website');
        if (!hasWebsite) {
            console.log('添加website列到providers表...');
            db.run(`ALTER TABLE providers ADD COLUMN website TEXT`, (err) => {
                if (err) {
                    console.error('添加website列失败:', err);
                } else {
                    console.log('✅ 添加website列成功');
                }
            });
        }
    });
}

// 迁移现有API密钥到新表
function migrateExistingApiKeys(db) {
    // 获取所有有API密钥的提供商
    db.all(`SELECT id, name, api_key FROM providers WHERE api_key IS NOT NULL AND api_key != ''`, (err, providers) => {
        if (err) {
            console.error('获取提供商失败:', err);
            return;
        }

        if (providers.length === 0) {
            console.log('没有需要迁移的API密钥');
            return;
        }

        console.log(`开始迁移${providers.length}个提供商的API密钥...`);

        // 为每个提供商创建API密钥记录
        let completed = 0;

        providers.forEach(provider => {
            db.run(`INSERT INTO api_keys (provider_id, key_name, api_key) VALUES (?, ?, ?)`,
                [provider.id, '默认密钥', provider.api_key],
                function(err) {
                    if (err) {
                        console.error(`迁移提供商${provider.name}的API密钥失败:`, err);
                    } else {
                        console.log(`✅ 成功迁移提供商${provider.name}的API密钥`);
                    }

                    completed++;

                    // 所有迁移完成后，清空原API密钥列
                    if (completed === providers.length) {
                        db.run(`UPDATE providers SET api_key = NULL`, (err) => {
                            if (err) {
                                console.error('清空原API密钥列失败:', err);
                            } else {
                                console.log('✅ API密钥迁移完成');
                            }
                        });
                    }
                }
            );
        });
    });
}

module.exports = {
    updateDatabaseSchema
};
