/**
 * 定时任务管理路由 (ESM)
 */

import express from 'express';
import scheduler from '../scheduler.js';
import { logOperation } from '../db_init.js';
import { logger } from '../src/utils/logger.js';

const router = express.Router();

// 定时任务管理页面
router.get('/scheduler', (req, res) => {
    try {
        // 获取定时任务状态
        const tasksStatus = scheduler.getTasksStatus();

        res.render('scheduler', {
            tasksStatus,
            scheduler: {
                isRunning: tasksStatus.isRunning
            }
        });
    } catch (error) {
        logger.error('获取定时任务状态失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 启动调度器
router.post('/scheduler/start', (req, res) => {
    try {
        scheduler.start();

        // 记录操作日志
        logOperation(global.db, 'START_SCHEDULER', 'system', null, 'system',
                    '启动定时任务调度器', 'success', req);

        res.json({
            success: true,
            message: '定时任务调度器已启动'
        });
    } catch (error) {
        logger.error('启动调度器失败:', error);

        // 记录错误日志
        logOperation(global.db, 'START_SCHEDULER', 'system', null, 'system',
                    `启动定时任务调度器失败: ${error.message}`, 'error', req);

        res.status(500).json({
            success: false,
            message: `启动调度器失败: ${error.message}`
        });
    }
});

// 停止调度器
router.post('/scheduler/stop', (req, res) => {
    try {
        scheduler.stop();

        // 记录操作日志
        logOperation(global.db, 'STOP_SCHEDULER', 'system', null, 'system',
                    '停止定时任务调度器', 'success', req);

        res.json({
            success: true,
            message: '定时任务调度器已停止'
        });
    } catch (error) {
        logger.error('停止调度器失败:', error);

        // 记录错误日志
        logOperation(global.db, 'STOP_SCHEDULER', 'system', null, 'system',
                    `停止定时任务调度器失败: ${error.message}`, 'error', req);

        res.status(500).json({
            success: false,
            message: `停止调度器失败: ${error.message}`
        });
    }
});

// 手动执行模型检测
router.post('/scheduler/execute/model-detection', async (req, res) => {
    try {
        await scheduler.executeModelDetection();

        // 记录操作日志
        logOperation(global.db, 'MANUAL_DETECT_MODELS', 'system', null, 'system',
                    '手动执行模型检测', 'success', req);

        res.json({
            success: true,
            message: '模型检测已执行'
        });
    } catch (error) {
        logger.error('手动执行模型检测失败:', error);

        // 记录错误日志
        logOperation(global.db, 'MANUAL_DETECT_MODELS', 'system', null, 'system',
                    `手动执行模型检测失败: ${error.message}`, 'error', req);

        res.status(500).json({
            success: false,
            message: `模型检测执行失败: ${error.message}`
        });
    }
});

// 手动执行健康检查
router.post('/scheduler/execute/health-check', async (req, res) => {
    try {
        await scheduler.executeHealthCheck();

        // 记录操作日志
        logOperation(global.db, 'MANUAL_HEALTH_CHECK', 'system', null, 'system',
                    '手动执行健康检查', 'success', req);

        res.json({
            success: true,
            message: '健康检查已执行'
        });
    } catch (error) {
        logger.error('手动执行健康检查失败:', error);

        // 记录错误日志
        logOperation(global.db, 'MANUAL_HEALTH_CHECK', 'system', null, 'system',
                    `手动执行健康检查失败: ${error.message}`, 'error', req);

        res.status(500).json({
            success: false,
            message: `健康检查执行失败: ${error.message}`
        });
    }
});

// 手动执行日志清理
router.post('/scheduler/execute/log-cleanup', async (req, res) => {
    try {
        await scheduler.executeLogCleanup();

        // 记录操作日志
        logOperation(global.db, 'MANUAL_LOG_CLEANUP', 'system', null, 'system',
                    '手动执行日志清理', 'success', req);

        res.json({
            success: true,
            message: '日志清理已执行'
        });
    } catch (error) {
        logger.error('手动执行日志清理失败:', error);

        // 记录错误日志
        logOperation(global.db, 'MANUAL_LOG_CLEANUP', 'system', null, 'system',
                    `手动执行日志清理失败: ${error.message}`, 'error', req);

        res.status(500).json({
            success: false,
            message: `日志清理执行失败: ${error.message}`
        });
    }
});

// 获取定时任务状态API
router.get('/api/scheduler/status', (req, res) => {
    try {
        const tasksStatus = scheduler.getTasksStatus();
        res.json(tasksStatus);
    } catch (error) {
        logger.error('获取定时任务状态失败:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
