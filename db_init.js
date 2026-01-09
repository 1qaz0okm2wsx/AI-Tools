/**
 * 数据库初始化模块 (ESM)
 */

// 数据库初始化
/**
 * @param {any} db
 */
export function initializeDatabase(db) {
    // 创建提供商表
    db.run(`CREATE TABLE IF NOT EXISTS providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        url TEXT NOT NULL,
        website TEXT,
        api_key TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 创建API密钥表
    db.run(`CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id INTEGER NOT NULL,
        key_name TEXT NOT NULL,
        api_key TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES providers (id) ON DELETE CASCADE
    )`);

    // 创建令牌使用日志表
    db.run(`CREATE TABLE IF NOT EXISTS token_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id INTEGER NOT NULL,
        model_id TEXT NOT NULL,
        api_key_id INTEGER,
        request_tokens INTEGER DEFAULT 0,
        response_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        cost DECIMAL(10, 6) DEFAULT 0.000000,
        request_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        response_time_ms INTEGER,
        status TEXT NOT NULL,
        error_message TEXT,
        FOREIGN KEY (provider_id) REFERENCES providers (id) ON DELETE CASCADE,
        FOREIGN KEY (api_key_id) REFERENCES api_keys (id) ON DELETE SET NULL
    )`);

    // 创建API接口地址表
    db.run(`CREATE TABLE IF NOT EXISTS api_endpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id INTEGER NOT NULL,
        endpoint_url TEXT NOT NULL,
        endpoint_name TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES providers (id) ON DELETE CASCADE
    )`);

    // 创建模型表
    db.run(`CREATE TABLE IF NOT EXISTS models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id INTEGER,
        model_name TEXT NOT NULL,
        model_id TEXT NOT NULL,
        description TEXT,
        category TEXT,
        context_window TEXT,
        capabilities TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES providers (id) ON DELETE CASCADE
    )`);

    // 创建操作日志表
    db.run(`CREATE TABLE IF NOT EXISTS operation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_type TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id INTEGER,
        target_name TEXT,
        details TEXT,
        user_ip TEXT,
        user_agent TEXT,
        status TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 添加索引以提高查询性能
    db.run(`CREATE INDEX IF NOT EXISTS idx_providers_created_at ON providers(created_at DESC)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_models_provider_id ON models(provider_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_models_model_id ON models(model_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_logs_created_at ON operation_logs(created_at DESC)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_logs_operation_type ON operation_logs(operation_type)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_api_endpoints_provider_id ON api_endpoints(provider_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_api_keys_provider_id ON api_keys(provider_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_token_logs_provider_id ON token_logs(provider_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_token_logs_model_id ON token_logs(model_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_token_logs_request_time ON token_logs(request_time DESC)`);
}

// 记录操作日志的辅助函数
/**
 * @param {any} db
 * @param {any} operationType
 * @param {any} targetType
 * @param {any} targetId
 * @param {any} targetName
 * @param {any} details
 * @param {any} status
 * @param {any} req
 */
export function logOperation(db, operationType, targetType, targetId, targetName, details, status, req) {
    const userIP = req ? req.headers['x-forwarded-for'] || req.connection?.remoteAddress : 'system';
    const userAgent = req ? req.headers['user-agent'] : 'system';

    db.run(
        `INSERT INTO operation_logs (operation_type, target_type, target_id, target_name, details, user_ip, user_agent, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [operationType, targetType, targetId, targetName, details, userIP, userAgent, status],
        /** @param {any} err */
        (err) => {
            if (err) {
                console.error('记录操作日志失败:', err.message);
            }
        }
    );
}
