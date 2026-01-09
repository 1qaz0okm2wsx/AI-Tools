/**
 * 内存管理模块 (ESM)
 */

const memoryManager = {
    // 清理定时器
    cleanupInterval: null,
    // 上次内存使用情况，用于计算变化
    lastMemoryUsage: null,

    // 启动自动清理
    startAutoCleanup(intervalMs = 30000) {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        console.log(`启动内存自动清理，间隔: ${intervalMs/1000}秒`);

        // 立即执行一次清理
        this.performCleanup();

        // 设置定时清理
        this.cleanupInterval = setInterval(() => {
            this.performCleanup();
        }, intervalMs);
    },

    // 获取实时内存使用情况
    getRealtimeMemoryUsage() {
        // 使用process.memoryUsage()获取实时内存数据
        const memUsage = process.memoryUsage();
        const timestamp = Date.now();

        // 计算与上次记录的变化
        let change = {};
        if (this.lastMemoryUsage) {
            const timeDiff = (timestamp - this.lastMemoryUsage.timestamp) / 1000; // 秒
            change = {
                rss: memUsage.rss - this.lastMemoryUsage.rss,
                heapTotal: memUsage.heapTotal - this.lastMemoryUsage.heapTotal,
                heapUsed: memUsage.heapUsed - this.lastMemoryUsage.heapUsed,
                external: memUsage.external - this.lastMemoryUsage.external,
                timeDiff: timeDiff
            };
        }

        // 保存当前内存使用情况
        this.lastMemoryUsage = {
            ...memUsage,
            timestamp: timestamp
        };

        return {
            current: {
                rss: memUsage.rss,
                heapTotal: memUsage.heapTotal,
                heapUsed: memUsage.heapUsed,
                external: memUsage.external,
                arrayBuffers: memUsage.arrayBuffers
            },
            formatted: {
                rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`,
                heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
                heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
                external: `${(memUsage.external / 1024 / 1024).toFixed(2)} MB`,
                arrayBuffers: memUsage.arrayBuffers ? `${(memUsage.arrayBuffers / 1024 / 1024).toFixed(2)} MB` : 'N/A'
            },
            change: change,
            timestamp: timestamp
        };
    },

    // 执行内存清理
    performCleanup() {
        try {
            // 获取清理前的内存使用情况
            const beforeCleanup = this.getRealtimeMemoryUsage();

            // 强制垃圾回收（如果可用）
            if (global.gc) {
                global.gc();
            }

            // 短暂延迟后获取清理后的内存使用情况
            setTimeout(() => {
                const afterCleanup = this.getRealtimeMemoryUsage();

                // 计算清理效果
                const cleanedUp = {
                    rss: beforeCleanup.current.rss - afterCleanup.current.rss,
                    heapUsed: beforeCleanup.current.heapUsed - afterCleanup.current.heapUsed
                };

                // 输出详细的内存信息
                console.log(`\n[${new Date(afterCleanup.timestamp).toLocaleTimeString()}] 实时内存使用情况:`);
                console.log(`  RSS: ${afterCleanup.formatted.rss} (${cleanedUp.rss > 0 ? '-' : ''}${(cleanedUp.rss / 1024 / 1024).toFixed(2)} MB)`);
                console.log(`  堆总量: ${afterCleanup.formatted.heapTotal}`);
                console.log(`  堆使用: ${afterCleanup.formatted.heapUsed} (${cleanedUp.heapUsed > 0 ? '-' : ''}${(cleanedUp.heapUsed / 1024 / 1024).toFixed(2)} MB)`);
                console.log(`  外部内存: ${afterCleanup.formatted.external}`);
                if (afterCleanup.formatted.arrayBuffers !== 'N/A') {
                    console.log(`  数组缓冲区: ${afterCleanup.formatted.arrayBuffers}`);
                }

                // 显示变化趋势
                if (afterCleanup.change.timeDiff) {
                    const rssRate = (afterCleanup.change.rss / 1024 / 1024) / afterCleanup.change.timeDiff;
                    const heapRate = (afterCleanup.change.heapUsed / 1024 / 1024) / afterCleanup.change.timeDiff;
                    console.log(`  变化速率: RSS ${rssRate >= 0 ? '+' : ''}${rssRate.toFixed(2)} MB/s, 堆 ${heapRate >= 0 ? '+' : ''}${heapRate.toFixed(2)} MB/s`);
                }

                // 如果内存使用过高，发出警告
                const heapUsedMB = afterCleanup.current.heapUsed / 1024 / 1024;
                if (heapUsedMB > 500) {
                    console.warn(`⚠️ 内存使用过高 (${afterCleanup.formatted.heapUsed})，建议检查内存泄漏`);
                }

                console.log(''); // 添加空行以提高可读性
            }, 100); // 100毫秒延迟，确保垃圾回收完成
        } catch (error) {
            console.error('内存清理过程中出错:', error);
        }
    },

    // 停止自动清理
    stopAutoCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            console.log('已停止内存自动清理');
        }
    }
};

export default memoryManager;
