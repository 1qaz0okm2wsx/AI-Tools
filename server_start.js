
// 启动服务器
global.app.listen(global.PORT, async () => {
    console.log(`AI模型管理工具运行在 http://localhost:${global.PORT}`);
    
    // 启动内存自动清理功能，每30秒清理一次
    memoryManager.startAutoCleanup(30000);
    
    // 获取所有提供商并启动API检查
    global.db.all('SELECT id, name, url, api_key FROM providers', async (err, providers) => {
        if (err) {
            console.error('获取提供商列表失败:', err.message);
        } else {
            // 启动API可用性检查，每60秒检查一次
            apiChecker.startPeriodicCheck(providers, 60000);
        }
    });

    // 服务器启动后自动检测所有提供商的模型
    try {
        const providersModule = await import('./routes/providers.js');
        await providersModule.autoDetectAllModels();
        console.log('✅ 服务器启动时的模型自动检测已完成');
    } catch (error) {
        console.error('❌ 服务器启动时的模型自动检测失败:', error.message);
    }
});
