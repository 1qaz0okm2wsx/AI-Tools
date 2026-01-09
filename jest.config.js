/**
 * Jest配置文件
 */

export default {
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
  testTimeout: 30000
};
