/**
 * 项目类型定义
 */

// 数据库相关类型
export interface Provider {
  id: number;
  name: string;
  url: string;
  website?: string;
  api_key?: string;
  created_at?: string;
}

export interface ApiKey {
  id: number;
  provider_id: number;
  key_name: string;
  api_key: string;
  is_active: number;
  created_at?: string;
  updated_at?: string;
}

export interface Model {
  id: number;
  provider_id: number;
  model_name: string;
  model_id: string;
  description?: string;
  category?: string;
  context_window?: string;
  capabilities?: string | string[];
  created_at?: string;
}

export interface ApiEndpoint {
  id: number;
  provider_id: number;
  endpoint_url: string;
  endpoint_name?: string;
  is_active: number;
  created_at?: string;
}

export interface OperationLog {
  id: number;
  operation_type: string;
  target_type: string;
  target_id?: number;
  target_name?: string;
  details?: string;
  user_ip?: string;
  user_agent?: string;
  status: string;
  created_at?: string;
}

export interface TokenLog {
  id: number;
  provider_id: number;
  model_id: string;
  api_key_id?: number;
  request_tokens: number;
  response_tokens: number;
  total_tokens: number;
  cost: number;
  request_time: string;
  response_time_ms?: number;
  status: string;
  error_message?: string;
}

// Express 相关类型
export interface Request {
  headers: {
    'x-forwarded-for'?: string;
    'user-agent'?: string;
    authorization?: string;
    [key: string]: any;
  };
  connection?: {
    remoteAddress?: string;
  };
  body: any;
  query: any;
  params: any;
  path: string;
}

export interface Response {
  status(code: number): Response;
  json(data: any): void;
  render(view: string, data?: any): void;
  redirect(url: string): void;
  setHeader(name: string, value: string): void;
  write(data: string): void;
  end(): void;
}

// 模型分析器相关类型
export interface DetectedModel {
  id: string;
  name: string;
  provider: string;
  description?: string;
  category?: string;
  context?: string;
  capabilities?: string[];
}

export interface ProviderConfig {
  id: number;
  name: string;
  url: string;
  api_key?: string;
}

// 浏览器相关类型
export interface BrowserConfig {
  DEFAULT_PORT: number;
  CONNECTION_TIMEOUT: number;
  STEALTH_DELAY_MIN: number;
  STEALTH_DELAY_MAX: number;
  ACTION_DELAY_MIN: number;
  ACTION_DELAY_MAX: number;
  DEFAULT_ELEMENT_TIMEOUT: number;
  FALLBACK_ELEMENT_TIMEOUT: number;
  ELEMENT_CACHE_MAX_AGE: number;
  STREAM_CHECK_INTERVAL_MIN: number;
  STREAM_CHECK_INTERVAL_MAX: number;
  STREAM_CHECK_INTERVAL_DEFAULT: number;
  STREAM_SILENCE_THRESHOLD: number;
  STREAM_MAX_TIMEOUT: number;
  STREAM_INITIAL_WAIT: number;
  STREAM_RERENDER_WAIT: number;
  STREAM_CONTENT_SHRINK_TOLERANCE: number;
  STREAM_MIN_VALID_LENGTH: number;
  STREAM_STABLE_COUNT_THRESHOLD: number;
  STREAM_SILENCE_THRESHOLD_FALLBACK: number;
  MAX_MESSAGE_LENGTH: number;
  MAX_MESSAGES_COUNT: number;
  STREAM_INITIAL_ELEMENT_WAIT: number;
  STREAM_MAX_ABNORMAL_COUNT: number;
  STREAM_MAX_ELEMENT_MISSING: number;
  STREAM_CONTENT_SHRINK_THRESHOLD: number;
  STREAM_USER_MSG_WAIT: number;
  STREAM_PRE_BASELINE_DELAY: number;
}

// 日志相关类型
export interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
  errorType?: string;
  errorCode?: string;
  category?: string;
  context?: any;
}

export interface ErrorSummary {
  type: string;
  code: string;
  category: string;
  message: string;
  count: number;
}

// 数据库统计类型
export interface DatabaseStats {
  tables: Record<string, { row_count: number }>;
  indexes: Record<string, string[]>;
}

// API 响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface OpenAIModel {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
}

export interface OpenAIModelsResponse {
  object: string;
  data: OpenAIModel[];
}

// 聊天消息类型
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
}

// Winston 日志类型
export interface WinstonLogInfo {
  level: string;
  message: string;
  timestamp?: string;
  errorType?: string;
  context?: any;
  stack?: string;
  showSolution?: boolean;
}