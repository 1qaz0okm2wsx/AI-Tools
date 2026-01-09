
/**
 * 日志路由 (ESM)
 */

import express from 'express';
import { logOperation } from '../db_init.js';
import { logger } from '../src/utils/logger.js';

const router = express.Router();

// 日志页面路由
router.get('/logs', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 20; // 每页显示的日志数量
    const offset = (page - 1) * limit;
    const operationType = req.query.type || '';

    // 构建查询条件
    let whereClause = '';
    let queryParams = [limit, offset];

    if (operationType) {
        whereClause = 'WHERE operation_type = ?';
        queryParams = [operationType, limit, offset];
    }

    // 获取总日志数
    global.db.get(`SELECT COUNT(*) as total FROM operation_logs ${whereClause}`,
           operationType ? [operationType] : [],
           (err, countResult) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        const totalLogs = countResult.total;
        const totalPages = Math.ceil(totalLogs / limit);

        // 获取当前页的日志数据
        global.db.all(`
            SELECT id, operation_type, target_type, target_id, target_name, details, user_ip, status, created_at
            FROM operation_logs
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `, queryParams, (err, logs) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            // 格式化日志数据
            const formattedLogs = logs.map(log => {
                // 格式化时间
                const createdAt = new Date(log.created_at);
                log.formatted_time = createdAt.toLocaleString('zh-CN');

                // 根据操作类型设置样式类
                switch (log.operation_type) {
                    case 'CREATE':
                        log.type_class = 'success';
                        break;
                    case 'UPDATE':
                        log.type_class = 'info';
                        break;
                    case 'DELETE':
                        log.type_class = 'danger';
                        break;
                    case 'DETECT_MODELS':
                        log.type_class = 'primary';
                        break;
                    case 'HEALTH_CHECK':
                        log.type_class = 'secondary';
                        break;
                    default:
                        log.type_class = 'light';
                }

                // 根据状态设置样式类
                switch (log.status) {
                    case 'success':
                        log.status_class = 'success';
                        log.status_icon = '✅';
                        break;
                    case 'error':
                        log.status_class = 'danger';
                        log.status_icon = '❌';
                        break;
                    case 'warning':
                        log.status_class = 'warning';
                        log.status_icon = '⚠️';
                        break;
                    default:
                        log.status_class = 'secondary';
                        log.status_icon = 'ℹ️';
                }

                return log;
            });

            // 获取所有操作类型
            global.db.all(`SELECT DISTINCT operation_type FROM operation_logs ORDER BY operation_type`, (err, operationTypes) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }

                // 渲染页面，传递分页信息
                res.render('logs', {
                    logs: formattedLogs,
                    operationTypes,
                    currentType: operationType,
                    pagination: {
                        currentPage: page,
                        totalPages: totalPages,
                        totalItems: totalLogs,
                        hasNextPage: page < totalPages,
                        hasPrevPage: page > 1,
                        nextPage: page + 1,
                        prevPage: page - 1
                    }
                });
            });
        });
    });
});

// 清理日志路由
router.post('/clear-logs', (req, res) => {
    const { days } = req.body;
    const daysToKeep = parseInt(days) || 30; // 默认保留30天的日志

    // 计算截止日期
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    // 删除旧日志
    global.db.run(`DELETE FROM operation_logs WHERE created_at < ?`, [cutoffDate.toISOString()], function(err) {
        if (err) {
            logger.error('清理日志失败:', err);
            return res.redirect('/logs?error=' + encodeURIComponent('清理日志失败: ' + err.message));
        }

        const message = `已成功清理 ${this.changes} 条超过 ${daysToKeep} 天的日志`;
        logOperation(global.db, 'CLEAR_LOGS', 'system', null, 'system',
                    `清理了 ${this.changes} 条超过 ${daysToKeep} 天的日志`, 'success', req);

        res.redirect('/logs?success=' + encodeURIComponent(message));
    });
});

// 导出日志路由
router.get('/export-logs', (req, res) => {
    const { format, type, days } = req.query;
    const exportFormat = format || 'json';
    const operationType = type || '';
    const daysToExport = parseInt(days) || 7; // 默认导出7天的日志

    // 计算起始日期
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysToExport);

    // 构建查询条件
    let whereClause = 'WHERE created_at >= ?';
    let queryParams = [startDate.toISOString()];

    if (operationType) {
        whereClause += ' AND operation_type = ?';
        queryParams.push(operationType);
    }

    // 查询日志
    global.db.all(`
        SELECT id, operation_type, target_type, target_id, target_name, details, user_ip, user_agent, status, created_at
        FROM operation_logs
        ${whereClause}
        ORDER BY created_at DESC
    `, queryParams, (err, logs) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        // 根据格式导出
        if (exportFormat === 'csv') {
            // CSV格式
            const csvHeaders = [
                'ID', '操作类型', '目标类型', '目标ID', '目标名称', 
                '详情', '用户IP', '用户代理', '状态', '创建时间'
            ].join(',');

            const csvRows = logs.map(log => [
                log.id,
                log.operation_type,
                log.target_type,
                log.target_id,
                log.target_name,
                `"${log.details || ''}"`, // 处理可能的逗号
                log.user_ip,
                `"${log.user_agent || ''}"`, // 处理可能的逗号
                log.status,
                log.created_at
            ].join(','));

            const csvContent = [csvHeaders, ...csvRows].join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="logs_${new Date().toISOString().split('T')[0]}.csv"`);
            res.send(csvContent);
        } else {
            // JSON格式（默认）
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="logs_${new Date().toISOString().split('T')[0]}.json"`);
            res.json({
                export_date: new Date().toISOString(),
                filters: {
                    operation_type: operationType || 'all',
                    days: daysToExport
                },
                count: logs.length,
                logs: logs
            });
        }
    });
});

export default router;
