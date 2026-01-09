/**
 * 浏览器启动工具模块
 * 提供检查、启动 Chrome 并等待 remote debugging 就绪的功能
 */

import { spawn } from 'child_process';
import { logger } from './logger.js';

/**
 * Chrome 路径配置（按平台）
 * @type {{ [key: string]: string[] }}
 */
const CHROME_PATHS = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    // Edge浏览器（Chromium内核，可用于浏览器自动化）
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    // 其他可能的安装路径
    process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\Application\\msedge.exe'
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ],
  aix: [],
  freebsd: [],
  openbsd: [],
  sunos: [],
  android: []
};

/**
 * 查找 Chrome 可执行文件路径
 * @returns {string | null} Chrome 路径，如果未找到则返回 null
 */
function findChromePath() {
  const platform = process.platform;
  const paths = CHROME_PATHS[platform] || CHROME_PATHS.linux || [];

  for (const path of paths) {
    try {
      // 简单检查文件是否存在
      const fs = require('fs');
      if (fs.existsSync(path)) {
        logger.debug(`[BROWSER_LAUNCHER] 找到 Chrome: ${path}`);
        return path;
      }
    } catch (/** @type {any} */ error) {
      // 忽略错误，继续检查下一个路径
    }
  }

  logger.warn(`[BROWSER_LAUNCHER] 未找到 Chrome 可执行文件`);
  return null;
}

/**
 * 检查 remote debugging 端口是否就绪
 * @param {number} [port=9222] - 调试端口
 * @param {number} [timeout=2000] - 超时时间（毫秒）
 * @returns {Promise<boolean>} 是否就绪
 */
async function checkDebugUrl(port = 9222, timeout = 2000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.debug(`[BROWSER_LAUNCHER] /json/version 响应状态: ${response.status}`);
      return false;
    }

    const data = await response.json();
    const isReady = !!data.webSocketDebuggerUrl;

    if (isReady) {
      logger.info(`[BROWSER_LAUNCHER] Remote debugging 已就绪: ${data.webSocketDebuggerUrl}`);
    }

    return isReady;
  } catch (/** @type {any} */ error) {
    if (error?.name === 'AbortError') {
      logger.debug(`[BROWSER_LAUNCHER] 检查 /json/version 超时`);
    } else {
      logger.debug(`[BROWSER_LAUNCHER] 检查 /json/version 失败: ${error?.message || String(error)}`);
    }
    return false;
  }
}

/**
 * 启动 Chrome 浏览器（非 headless）
 * @param {object} [options] - 启动选项
 * @param {number} [options.port=9222] - 调试端口
 * @param {string} [options.userDataDir] - 用户数据目录
 * @param {string} [options.chromePath] - Chrome 可执行文件路径（可选）
 * @returns {Promise<{success: boolean, pid?: number, error?: string}>}
 */
async function launchChrome(options = {}) {
  const {
    port = 9222,
    userDataDir = process.env.TMP || (process.platform === 'win32' ? 'C:\\temp\\chrome-debug' : '/tmp/chrome-debug'),
    chromePath: customChromePath
  } = options;

  const chromePath = customChromePath || findChromePath();

  if (!chromePath) {
    const error = '未找到 Chrome 可执行文件';
    logger.error(`[BROWSER_LAUNCHER] ${error}`);
    return { success: false, error };
  }

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    '--metrics-recording-only',
    '--disable-default-apps',
    '--no-first-run',
    '--disable-popup-blocking'
  ];

  logger.info(`[BROWSER_LAUNCHER] 启动 Chrome: ${chromePath}`);
  logger.debug(`[BROWSER_LAUNCHER] 启动参数: ${args.join(' ')}`);

  try {
    const child = spawn(chromePath, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });

    child.unref();

    logger.info(`[BROWSER_LAUNCHER] Chrome 进程已启动, PID: ${child.pid}`);

    return { success: true, pid: child.pid };
  } catch (/** @type {any} */ error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[BROWSER_LAUNCHER] 启动 Chrome 失败: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

/**
 * 等待 remote debugging 端口就绪
 * @param {number} [port=9222] - 调试端口
 * @param {object} [options] - 等待选项
 * @param {number} [options.maxWait=30000] - 最大等待时间（毫秒）
 * @param {number} [options.interval=500] - 检查间隔（毫秒）
 * @returns {Promise<boolean>} 是否就绪
 */
async function waitForDebugReady(port = 9222, options = {}) {
  const {
    maxWait = 30000,
    interval = 500
  } = options;

  const startTime = Date.now();
  const endTime = startTime + maxWait;

  logger.info(`[BROWSER_LAUNCHER] 等待 remote debugging 端口 ${port} 就绪...`);

  while (Date.now() < endTime) {
    const isReady = await checkDebugUrl(port, interval);

    if (isReady) {
      const elapsed = Date.now() - startTime;
      logger.info(`[BROWSER_LAUNCHER] Remote debugging 端口 ${port} 已就绪 (耗时: ${elapsed}ms)`);
      return true;
    }

    // 等待下一次检查
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  logger.error(`[BROWSER_LAUNCHER] 等待 remote debugging 端口 ${port} 超时 (${maxWait}ms)`);
  return false;
}

/**
 * 确保浏览器已启动并可连接
 * 流程：检查 -> 若不可用则启动 -> 等待就绪 -> 继续
 * @param {object} [options] - 选项
 * @param {number} [options.port=9222] - 调试端口
 * @param {boolean} [options.autoLaunch=true] - 如果未就绪是否自动启动
 * @param {number} [options.maxWait=30000] - 最大等待时间（毫秒）
 * @param {string} [options.userDataDir] - 用户数据目录
 * @param {string} [options.chromePath] - Chrome 可执行文件路径（可选）
 * @returns {Promise<{success: boolean, launched: boolean, error?: string}>}
 */
async function ensureBrowserReady(options = {}) {
  const {
    port = 9222,
    autoLaunch = true,
    maxWait = 30000,
    userDataDir,
    chromePath
  } = options;

  logger.info(`[BROWSER_LAUNCHER] 检查浏览器状态 (端口: ${port})...`);

  // 1. 检查是否已就绪
  const isReady = await checkDebugUrl(port, 2000);

  if (isReady) {
    logger.info(`[BROWSER_LAUNCHER] 浏览器已就绪 (端口: ${port})`);
    return { success: true, launched: false };
  }

  // 2. 如果不允许自动启动，返回失败
  if (!autoLaunch) {
    const error = `浏览器未就绪且不允许自动启动 (端口: ${port})`;
    logger.warn(`[BROWSER_LAUNCHER] ${error}`);
    return { success: false, launched: false, error };
  }

  // 3. 启动 Chrome
  logger.info(`[BROWSER_LAUNCHER] 浏览器未就绪，尝试启动 Chrome...`);
  const launchResult = await launchChrome({ port, userDataDir, chromePath });

  if (!launchResult.success) {
    return { success: false, launched: false, error: launchResult.error };
  }

  // 4. 等待就绪
  const ready = await waitForDebugReady(port, { maxWait });

  if (!ready) {
    const error = `启动 Chrome 后等待就绪超时 (端口: ${port})`;
    logger.error(`[BROWSER_LAUNCHER] ${error}`);
    return { success: false, launched: true, error };
  }

  logger.info(`[BROWSER_LAUNCHER] 浏览器已成功启动并就绪 (端口: ${port})`);
  return { success: true, launched: true };
}

/**
 * 获取浏览器版本信息
 * @param {number} [port=9222] - 调试端口
 * @returns {Promise<{Browser: string; 'Protocol-Version': string; 'User-Agent': string; 'WebKit-Version': string; webSocketDebuggerUrl: string} | null>} 版本信息
 */
async function getBrowserVersion(port = 9222) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (/** @type {any} */ error) {
    logger.debug(`[BROWSER_LAUNCHER] 获取浏览器版本失败: ${error?.message || String(error)}`);
    return null;
  }
}

export {
  findChromePath,
  checkDebugUrl,
  launchChrome,
  waitForDebugReady,
  ensureBrowserReady,
  getBrowserVersion
};

export default {
  findChromePath,
  checkDebugUrl,
  launchChrome,
  waitForDebugReady,
  ensureBrowserReady,
  getBrowserVersion
};
