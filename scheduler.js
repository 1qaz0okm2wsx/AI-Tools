/**
 * 定时任务管理器 (ESM)
 * 负责管理所有定时任务的创建、启动和停止
 */

import { logOperation } from './db_init.js';
import apiChecker from './api_checker.js';

// 动态导入 providers 模块避免循环依赖
let autoDetectAllModels = null;

async function loadProvidersModule() {
    if (!autoDetectAllModels) {
        const providers = await import('./routes/providers.js');
        autoDetectAllModels = providers.autoDetectAllModels;
    }
    return autoDetectAllModels;
}

class Scheduler {
    constructor() {
        this.tasks = new Map(); // 存储所有定时任务
        this.isRunning = false; // 调度器是否运行中
    }

    /**
     * 启动调度器
     */
    start() {
        if (this.isRunning) {
            console.log('调度器已在运行中');
            return;
        }

        console.log('启动定时任务调度器...');
        this.isRunning = true;

        // 启动所有定时任务
        this.startModelDetectionTask();
        this.startHealthCheckTask();
        this.startLogCleanupTask();

        console.log('定时任务调度器启动完成');
    }

    /**
     * 停止调度器
     */
    stop() {
        if (!this.isRunning) {
            console.log('调度器未在运行');
            return;
        }

        console.log('停止定时任务调度器...');
        this.isRunning = false;

        // 清除所有定时任务
        this.tasks.forEach((task, name) => {
            if (task.interval) {
                clearInterval(task.interval);
                console.log(`已停止定时任务: ${name}`);
            }
        });

        this.tasks.clear();
        console.log('定时任务调度器已停止');
    }

    /**
     * 启动模型检测定时任务
     */
    startModelDetectionTask() {
        // 默认每天凌晨2点执行一次
        const schedule = process.env.MODEL_DETECTION_SCHEDULE || '0 2 * * *';
        const intervalMs = this.parseCronToMilliseconds(schedule);

        // 立即执行一次
        this.executeModelDetection();

        // 设置定时任务
        const interval = setInterval(() => {
            this.executeModelDetection();
        }, intervalMs);

        this.tasks.set('modelDetection', {
            name: '模型自动检测',
            schedule,
            interval,
            lastExecution: new Date()
        });

        console.log(`已启动模型检测定时任务，执行间隔: ${intervalMs / 1000 / 60 / 60} 小时`);
    }

    /**
     * 执行模型检测
     */
    async executeModelDetection() {
        try {
            console.log('开始执行定时模型检测...');
            const startTime = Date.now();

            const detectFn = await loadProvidersModule();
            const models = await detectFn();

            const duration = Date.now() - startTime;
            console.log(`定时模型检测完成，共检测到 ${models.length} 个模型，耗时 ${duration}ms`);

            // 更新任务执行时间
            if (this.tasks.has('modelDetection')) {
                this.tasks.get('modelDetection').lastExecution = new Date();
            }

            // 记录操作日志
            logOperation(global.db, 'AUTO_DETECT_MODELS', 'system', null, 'system', 
                        `定时模型检测完成，共检测到 ${models.length} 个模型`, 'success', null);
        } catch (error) {
            console.error('定时模型检测失败:', error);

            // 记录错误日志
            logOperation(global.db, 'AUTO_DETECT_MODELS', 'system', null, 'system', 
                        `定时模型检测失败: ${error.message}`, 'error', null);
        }
    }

    /**
     * 启动健康检查定时任务
     */
    startHealthCheckTask() {
        // 默认每5分钟执行一次
        const intervalMs = process.env.HEALTH_CHECK_INTERVAL || 5 * 60 * 1000;

        // 设置定时任务
        const interval = setInterval(() => {
            this.executeHealthCheck();
        }, intervalMs);

        this.tasks.set('healthCheck', {
            name: '系统健康检查',
            intervalMs,
            interval,
            lastExecution: new Date()
        });

        console.log(`已启动健康检查定时任务，执行间隔: ${intervalMs / 1000 / 60} 分钟`);
    }

    /**
     * 执行健康检查
     */
    async executeHealthCheck() {
        try {
            console.log('开始执行定时健康检查...');

            // 获取所有提供商
            const providers = await new Promise((resolve, reject) => {
                global.db.all(`SELECT id, name, url, api_key FROM providers`, (err, rows) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve(rows);
                });
            });

            if (providers.length === 0) {
                console.log('没有找到任何提供商，跳过健康检查');
                return;
            }

            // 执行API检查
            const results = await apiChecker.checkAllApis(providers);

            console.log(`定时健康检查完成，检查了 ${providers.length} 个提供商`);

            // 更新任务执行时间
            if (this.tasks.has('healthCheck')) {
                this.tasks.get('healthCheck').lastExecution = new Date();
            }

            // 记录操作日志
            logOperation(global.db, 'AUTO_HEALTH_CHECK', 'system', null, 'system', 
                        `定时健康检查完成，检查了 ${providers.length} 个提供商`, 'success', null);
        } catch (error) {
            console.error('定时健康检查失败:', error);

            // 记录错误日志
            logOperation(global.db, 'AUTO_HEALTH_CHECK', 'system', null, 'system', 
                        `定时健康检查失败: ${error.message}`, 'error', null);
        }
    }

    /**
     * 启动日志清理定时任务
     */
    startLogCleanupTask() {
        // 默认每周日凌晨3点执行一次
        const schedule = process.env.LOG_CLEANUP_SCHEDULE || '0 3 * * 0';
        const intervalMs = this.parseCronToMilliseconds(schedule);

        // 设置定时任务
        const interval = setInterval(() => {
            this.executeLogCleanup();
        }, intervalMs);

        this.tasks.set('logCleanup', {
            name: '日志自动清理',
            schedule,
            interval,
            lastExecution: new Date()
        });

        console.log(`已启动日志清理定时任务，执行间隔: ${intervalMs / 1000 / 60 / 60 / 24} 天`);
    }

    /**
     * 执行日志清理
     */
    async executeLogCleanup() {
        try {
            console.log('开始执行定时日志清理...');

            // 默认保留30天的日志
            const daysToKeep = process.env.LOG_RETENTION_DAYS || 30;

            // 计算截止日期
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

            // 清理操作日志
            const operationLogsResult = await new Promise((resolve, reject) => {
                global.db.run(`DELETE FROM operation_logs WHERE created_at < ?`, 
                [cutoffDate.toISOString()], function(err) {
                    if (err) {
                        return reject(err);
                    }
                    resolve(this.changes);
                });
            });

            // 清理令牌日志
            const tokenLogsResult = await new Promise((resolve, reject) => {
                global.db.run(`DELETE FROM token_logs WHERE request_time < ?`, 
                [cutoffDate.toISOString()], function(err) {
                    if (err) {
                        return reject(err);
                    }
                    resolve(this.changes);
                });
            });

            console.log(`定时日志清理完成，清理了 ${operationLogsResult} 条操作日志和 ${tokenLogsResult} 条令牌日志`);

            // 更新任务执行时间
            if (this.tasks.has('logCleanup')) {
                this.tasks.get('logCleanup').lastExecution = new Date();
            }

            // 记录操作日志
            logOperation(global.db, 'AUTO_LOG_CLEANUP', 'system', null, 'system', 
                        `定时日志清理完成，清理了 ${operationLogsResult} 条操作日志和 ${tokenLogsResult} 条令牌日志`, 'success', null);
        } catch (error) {
            console.error('定时日志清理失败:', error);

            // 记录错误日志
            logOperation(global.db, 'AUTO_LOG_CLEANUP', 'system', null, 'system', 
                        `定时日志清理失败: ${error.message}`, 'error', null);
        }
    }

    /**
     * 将cron表达式转换为毫秒数
     * 这是一个简化版本，仅支持基本的时间间隔
     * @param {string} cronExpression - cron表达式
     * @returns {number} 毫秒数
     */
    parseCronToMilliseconds(cronExpression) {
        // 简化实现，仅支持固定间隔
        // 格式: "分 时 日 月 周"
        const parts = cronExpression.split(' ');

        // 如果是每天执行
        if (parts[2] === '*' && parts[3] === '*' && parts[4] === '*') {
            const minutes = parseInt(parts[0]) || 0;
            const hours = parseInt(parts[1]) || 0;

            // 计算到下一次执行的时间（毫秒）
            const now = new Date();
            const nextExecution = new Date();
            nextExecution.setHours(hours, minutes, 0, 0);

            // 如果今天的时间已过，则设置为明天
            if (nextExecution <= now) {
                nextExecution.setDate(nextExecution.getDate() + 1);
            }

            return nextExecution.getTime() - now.getTime();
        }

        // 如果是每周执行
        if (parts[2] === '*' && parts[3] === '*' && parts[4] !== '*') {
            const dayOfWeek = parseInt(parts[4]);
            const minutes = parseInt(parts[0]) || 0;
            const hours = parseInt(parts[1]) || 0;

            // 计算到下一次执行的时间（毫秒）
            const now = new Date();
            const nextExecution = new Date();
            nextExecution.setHours(hours, minutes, 0, 0);

            // 计算到目标星期几的天数差
            let daysToAdd = (dayOfWeek - now.getDay() + 7) % 7;
            if (daysToAdd === 0 && nextExecution <= now) {
                daysToAdd = 7; // 如果是今天但时间已过，则设置为下周
            }

            nextExecution.setDate(nextExecution.getDate() + daysToAdd);

            return nextExecution.getTime() - now.getTime();
        }

        // 默认返回24小时
        return 24 * 60 * 60 * 1000;
    }

    /**
     * 获取所有定时任务的状态
     */
    getTasksStatus() {
        const tasks = [];

        this.tasks.forEach((task, name) => {
            tasks.push({
                name,
                displayName: task.name,
                schedule: task.schedule || `${task.intervalMs / 1000 / 60} 分钟`,
                lastExecution: task.lastExecution,
                nextExecution: task.nextExecution
            });
        });

        return {
            isRunning: this.isRunning,
            tasks
        };
    }
}

// 创建单例实例
const scheduler = new Scheduler();

export default scheduler;
