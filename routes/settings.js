import express from 'express';
const router = express.Router();

router.get('/browser-settings', (req, res) => {
    res.render('browser-settings');
});

export default router;
