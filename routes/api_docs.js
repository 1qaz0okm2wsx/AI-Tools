/**
 * API 文档路由
 */

import express from 'express';

const router = express.Router();

// API 文档页面
router.get('/api-docs', (req, res) => {
    res.render('api-docs');
});

export default router;
