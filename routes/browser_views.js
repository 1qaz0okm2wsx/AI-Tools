/**
 * 浏览器自动化视图路由
 */

import express from 'express';
const router = express.Router();

// 浏览器管理页面
router.get('/browser', (req, res) => {
    res.render('browser');
});

export default router;