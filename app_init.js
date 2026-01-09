
import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import sqlite3 from 'sqlite3';
import 'dotenv/config';

// 初始化Express应用
export function initializeApp() {
    const app = express();
    const PORT = process.env.PORT || 3000;
    const DB_PATH = process.env.DB_PATH || './ai_models.db';
    const API_TIMEOUT = process.env.API_TIMEOUT || 10000;

    // 设置视图引擎
    app.set('view engine', 'ejs');
    app.set('views', path.join(path.dirname(new URL(import.meta.url).pathname), 'views'));

    // 中间件
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(bodyParser.json());
    app.use(express.static('public'));

    // 初始化数据库
    const db = new sqlite3.Database(DB_PATH);

    return {
        app,
        PORT,
        DB_PATH,
        API_TIMEOUT,
        db
    };
}
