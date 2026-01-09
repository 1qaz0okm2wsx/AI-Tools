/**
 * 增强日志工具模块 - 支持详细错误类型分类
 */

import winston from 'winston';

// 日志级别图标
/** @type {{ [key: string]: string }} */
const ICONS = {
  debug: '▫️',
  info: '🔹',
  warn: '⚠️',
  error: '❌',
  success: '✅',
  stream: '🌊',
  network: '🌐'
};

// 错误类别图标
/** @type {{ [key: string]: string }} */
const ERROR_CATEGORY_ICONS = {
  browser: '🌐',
  network: '📡',
  auth: '🔐',
  cookie: '🍪',
  element: '🎯',
  workflow: '⚙️',
  config: '📝',
  system: '💻',
  timeout: '⏱️',
  unknown: '❓'
};

// 详细错误类型定义
export const DetailedErrorTypes = {
  // 浏览器相关
  BROWSER_CONNECTION_FAILED: {
    code: 'E1001',
    category: 'browser',
    message: '浏览器连接失败',
    solution: '确保Chrome以远程调试模式启动 (--remote-debugging-port=9222)'
  },
  BROWSER_DISCONNECTED: {
    code: 'E1002',
    category: 'browser',
    message: '浏览器连接断开',
    solution: '检查Chrome进程是否仍在运行，服务会尝试自动重连'
  },
  BROWSER_PAGE_CRASH: {
    code: 'E1003',
    category: 'browser',
    message: '页面崩溃',
    solution: '检查内存使用情况，考虑重启浏览器'
  },

  // 网络相关
  NETWORK_TIMEOUT: {
    code: 'E2001',
    category: 'network',
    message: '网络请求超时',
    solution: '检查网络连接，目标服务器可能响应缓慢'
  },
  NETWORK_REQUEST_FAILED: {
    code: 'E2002',
    category: 'network',
    message: '网络请求失败',
    solution: '检查目标URL是否可访问'
  },
  NETWORK_DNS_FAILED: {
    code: 'E2003',
    category: 'network',
    message: 'DNS解析失败',
    solution: '检查域名是否正确，网络DNS设置是否正常'
  },

  // 认证相关
  AUTH_LOGIN_REQUIRED: {
    code: 'E3001',
    category: 'auth',
    message: '需要登录',
    solution: '在浏览器中完成登录操作'
  },
  AUTH_LOGIN_EXPIRED: {
    code: 'E3002',
    category: 'auth',
    message: '登录已过期',
    solution: '重新登录以刷新认证状态'
  },
  AUTH_CAPTCHA_REQUIRED: {
    code: 'E3003',
    category: 'auth',
    message: '需要验证码',
    solution: '在浏览器中完成验证码验证'
  },

  // Cookie相关
  COOKIE_LOAD_FAILED: {
    code: 'E4001',
    category: 'cookie',
    message: 'Cookie加载失败',
    solution: '检查cookies目录权限和文件格式'
  },
  COOKIE_SAVE_FAILED: {
    code: 'E4002',
    category: 'cookie',
    message: 'Cookie保存失败',
    solution: '检查磁盘空间和目录写权限'
  },
  COOKIE_EXPIRED: {
    code: 'E4003',
    category: 'cookie',
    message: 'Cookie已过期',
    solution: '重新登录以获取新Cookie'
  },
  COOKIE_INVALID: {
    code: 'E4004',
    category: 'cookie',
    message: 'Cookie格式无效',
    solution: '删除损坏的cookie文件，重新登录'
  },

  // 元素相关
  ELEMENT_NOT_FOUND: {
    code: 'E5001',
    category: 'element',
    message: '元素未找到',
    solution: '网页结构可能已变化，检查选择器配置'
  },
  ELEMENT_NOT_VISIBLE: {
    code: 'E5002',
    category: 'element',
    message: '元素不可见',
    solution: '等待页面完全加载或检查元素是否被隐藏'
  },
  ELEMENT_NOT_CLICKABLE: {
    code: 'E5003',
    category: 'element',
    message: '元素不可点击',
    solution: '元素可能被遮挡或禁用'
  },
  ELEMENT_STALE: {
    code: 'E5004',
    category: 'element',
    message: '元素引用失效',
    solution: '页面已刷新或元素已被移除，重新查找元素'
  },

  // 工作流相关
  WORKFLOW_STEP_FAILED: {
    code: 'E6001',
    category: 'workflow',
    message: '工作流步骤失败',
    solution: '检查工作流配置和页面状态'
  },
  WORKFLOW_TIMEOUT: {
    code: 'E6002',
    category: 'workflow',
    message: '工作流执行超时',
    solution: '页面响应过慢或网络不稳定'
  },
  WORKFLOW_CANCELLED: {
    code: 'E6003',
    category: 'workflow',
    message: '工作流被取消',
    solution: '用户主动取消或新请求覆盖'
  },

  // 配置相关
  CONFIG_INVALID: {
    code: 'E7001',
    category: 'config',
    message: '配置无效',
    solution: '检查配置文件格式和必填字段'
  },
  CONFIG_MISSING: {
    code: 'E7002',
    category: 'config',
    message: '配置缺失',
    solution: '确保配置文件存在且包含所需配置'
  },
  CONFIG_SITE_NOT_FOUND: {
    code: 'E7003',
    category: 'config',
    message: '站点配置未找到',
    solution: '在sites.json中添加对应站点配置'
  },

  // 系统相关
  SYSTEM_MEMORY_HIGH: {
    code: 'E8001',
    category: 'system',
    message: '内存使用过高',
    solution: '服务会自动清理，如持续出现请考虑重启'
  },
  SYSTEM_RESOURCE_LIMIT: {
    code: 'E8002',
    category: 'system',
    message: '系统资源限制',
    solution: '检查系统资源使用情况'
  },

  // 超时相关
  TIMEOUT_PAGE_LOAD: {
    code: 'E9001',
    category: 'timeout',
    message: '页面加载超时',
    solution: '检查网络连接或增加超时时间'
  },
  TIMEOUT_API_RESPONSE: {
    code: 'E9002',
    category: 'timeout',
    message: 'API响应超时',
    solution: '目标服务响应慢，可能正在处理中'
  },
  TIMEOUT_QUEUE_WAIT: {
    code: 'E9003',
    category: 'timeout',
    message: '队列等待超时',
    solution: '请求过多，等待时间过长'
  },

  // 未知错误
  UNKNOWN: {
    code: 'E0000',
    category: 'unknown',
    message: '未知错误',
    solution: '查看详细错误信息和日志'
  }
};

// 创建自定义格式化器
const customFormat = winston.format.printf(/** @type {any} */ ({ level, message, timestamp, ...meta }) => {
  const icon = ICONS[level] || '·';
  const time = timestamp ? String(timestamp).slice(11, 19) : '';
  
  // 构建基础日志
  let logLine = `[${time}] ${icon} [${level.toUpperCase().padEnd(5)}] ${message}`;
  
  // 如果有错误类型元数据，添加详细信息
  // @ts-ignore
  if (meta.errorType && DetailedErrorTypes[meta.errorType]) {
    // @ts-ignore
    const errorDef = DetailedErrorTypes[meta.errorType];
    const categoryIcon = ERROR_CATEGORY_ICONS[errorDef.category] || '❓';
    logLine += `\n       ${categoryIcon} [${errorDef.code}] ${errorDef.message}`;
    if (meta.showSolution !== false) {
      logLine += `\n       💡 解决方案: ${errorDef.solution}`;
    }
  }
  
  // 如果有额外上下文
  if (meta.context && Object.keys(meta.context).length > 0) {
    logLine += `\n       📋 上下文: ${JSON.stringify(meta.context)}`;
  }
  
  // 如果有堆栈信息
  if (meta.stack && level === 'error') {
    logLine += `\n       📍 堆栈:\n${String(meta.stack).split('\n').slice(0, 5).map(/** @type {any} */ s => '          ' + s).join('\n')}`;
  }
  
  return logLine;
});

// 创建日志器
export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    customFormat
  ),
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true
    })
  ]
});

// 添加带错误类型的日志方法
// @ts-ignore
logger.errorWithType = (/** @type {any} */ errorType, /** @type {any} */ message, /** @type {any} */ context = {}) => {
  // @ts-ignore
  const errorDef = DetailedErrorTypes[errorType] || DetailedErrorTypes.UNKNOWN;
  logger.error(message, {
    errorType,
    context,
    showSolution: true
  });
  return errorDef;
};

// @ts-ignore
logger.warnWithType = (/** @type {any} */ errorType, /** @type {any} */ message, /** @type {any} */ context = {}) => {
  logger.warn(message, {
    errorType,
    context,
    showSolution: true
  });
};

// 日志收集器（用于前端展示）
class LogCollector {
  constructor(maxLogs = 500) {
    /** @type {any[]} */
    this.logs = [];
    this.maxLogs = maxLogs;
    /** @type {{ [key: string]: number }} */
    this.errorSummary = {}; // 错误类型统计
  }

  add(/** @type {any} */ level, /** @type {any} */ message, /** @type {any} */ meta = {}) {
    const logEntry = {
      timestamp: Date.now() / 1000,
      level,
      message,
      errorType: meta.errorType || null,
      errorCode: meta.errorType ?
        // @ts-ignore
        (DetailedErrorTypes[meta.errorType]?.code || 'E0000') : null,
      category: meta.errorType ?
        // @ts-ignore
        (DetailedErrorTypes[meta.errorType]?.category || 'unknown') : null,
      context: meta.context || null
    };

    this.logs.push(logEntry);

    // 统计错误类型
    if (level === 'error' && meta.errorType) {
      this.errorSummary[meta.errorType] =
        (this.errorSummary[meta.errorType] || 0) + 1;
    }

    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  getRecent(/** @type {number} */ since = 0) {
    return this.logs.filter(log => log.timestamp > since);
  }

  getByCategory(/** @type {any} */ category) {
    return this.logs.filter(log => log.category === category);
  }

  getByErrorType(/** @type {any} */ errorType) {
    return this.logs.filter(log => log.errorType === errorType);
  }

  getErrorSummary() {
    return Object.entries(this.errorSummary)
      .map(([type, count]) => ({
        type,
        // @ts-ignore
        code: DetailedErrorTypes[type]?.code || 'E0000',
        // @ts-ignore
        category: DetailedErrorTypes[type]?.category || 'unknown',
        // @ts-ignore
        message: DetailedErrorTypes[type]?.message || '未知错误',
        count
      }))
      .sort((a, b) => b.count - a.count);
  }

  clear() {
    this.logs = [];
    this.errorSummary = {};
  }
}

export const logCollector = new LogCollector();

// 直接监听日志事件
logger.on('data', (info) => {
  logCollector.add(info.level, info.message, {
    errorType: info.errorType,
    context: info.context
  });
});

// 导出错误类型帮助函数
export function getErrorInfo(/** @type {any} */ errorType) {
  // @ts-ignore
  return DetailedErrorTypes[errorType] || DetailedErrorTypes.UNKNOWN;
}

export function getSolutionForError(/** @type {any} */ errorType) {
  // @ts-ignore
  const info = DetailedErrorTypes[errorType];
  return info ? info.solution : '查看详细日志获取更多信息';
}

export function getCategoryIcon(/** @type {any} */ category) {
  return ERROR_CATEGORY_ICONS[category] || ERROR_CATEGORY_ICONS.unknown;
}

// 错误分析器
export function analyzeError(/** @type {any} */ error) {
  const message = error.message?.toLowerCase() || '';
  const name = error.name?.toLowerCase() || '';

  // 根据错误消息自动分类
  if (message.includes('timeout') || name.includes('timeout')) {
    if (message.includes('page') || message.includes('navigation')) {
      return 'TIMEOUT_PAGE_LOAD';
    }
    if (message.includes('api') || message.includes('response')) {
      return 'TIMEOUT_API_RESPONSE';
    }
    return 'NETWORK_TIMEOUT';
  }

  if (message.includes('disconnected') || message.includes('disconnect')) {
    return 'BROWSER_DISCONNECTED';
  }

  if (message.includes('connect') && message.includes('fail')) {
    return 'BROWSER_CONNECTION_FAILED';
  }

  if (message.includes('not found') || message.includes('selector')) {
    return 'ELEMENT_NOT_FOUND';
  }

  if (message.includes('not visible') || message.includes('hidden')) {
    return 'ELEMENT_NOT_VISIBLE';
  }

  if (message.includes('not clickable') || message.includes('click intercepted')) {
    return 'ELEMENT_NOT_CLICKABLE';
  }

  if (message.includes('stale') || message.includes('detached')) {
    return 'ELEMENT_STALE';
  }

  if (message.includes('cookie')) {
    if (message.includes('load') || message.includes('read')) {
      return 'COOKIE_LOAD_FAILED';
    }
    if (message.includes('save') || message.includes('write')) {
      return 'COOKIE_SAVE_FAILED';
    }
    if (message.includes('expir')) {
      return 'COOKIE_EXPIRED';
    }
    return 'COOKIE_INVALID';
  }

  if (message.includes('login') || message.includes('auth')) {
    if (message.includes('required')) {
      return 'AUTH_LOGIN_REQUIRED';
    }
    if (message.includes('expired')) {
      return 'AUTH_LOGIN_EXPIRED';
    }
  }

  if (message.includes('captcha') || message.includes('verify')) {
    return 'AUTH_CAPTCHA_REQUIRED';
  }

  if (message.includes('dns') || message.includes('resolve')) {
    return 'NETWORK_DNS_FAILED';
  }

  if (message.includes('network') || message.includes('fetch') || message.includes('request failed')) {
    return 'NETWORK_REQUEST_FAILED';
  }

  if (message.includes('config')) {
    if (message.includes('invalid')) {
      return 'CONFIG_INVALID';
    }
    if (message.includes('missing') || message.includes('not found')) {
      return 'CONFIG_MISSING';
    }
  }

  if (message.includes('site') && message.includes('not found')) {
    return 'CONFIG_SITE_NOT_FOUND';
  }

  if (message.includes('memory') || message.includes('heap')) {
    return 'SYSTEM_MEMORY_HIGH';
  }

  if (message.includes('cancel')) {
    return 'WORKFLOW_CANCELLED';
  }

  if (message.includes('workflow') || message.includes('step')) {
    return 'WORKFLOW_STEP_FAILED';
  }

  return 'UNKNOWN';
}

// 智能记录错误（自动分析类型）
export function logSmartError(/** @type {any} */ error, /** @type {any} */ context = {}) {
  const errorType = analyzeError(error);
  const errorDef = DetailedErrorTypes[errorType];
  
  logger.error(`${error.message}`, {
    errorType,
    context,
    stack: error.stack,
    showSolution: true
  });
  
  return {
    type: errorType,
    code: errorDef.code,
    category: errorDef.category,
    solution: errorDef.solution
  };
}