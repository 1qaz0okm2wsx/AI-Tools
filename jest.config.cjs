/**
 * Jest配置文件 - 使用CommonJS格式，支持ESM项目
 */

module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    'routes/**/*.js'
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  testMatch: [
    '**/__tests__/**/*.js?(x)',
    '**/?(*.)+(spec|test).js?(x)'
  ],
  moduleFileExtensions: ['js', 'json'],
  verbose: true,
  testTimeout: 30000,
  // 使用 Babel 转换 JS 文件
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  // 模拟 ESM 导入
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  // 转换 node_modules 中的 sqlite3
  transformIgnorePatterns: [
    'node_modules/(?!(sqlite3)/)'
  ]
};
