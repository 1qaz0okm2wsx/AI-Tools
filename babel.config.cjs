/**
 * Babel配置文件 - 用于Jest测试 - 使用CommonJS格式
 */

module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: {
          node: 'current'
        },
        modules: 'commonjs' // 转换为 CommonJS 以便 Jest 处理
      }
    ]
  ],
  plugins: [
    '@babel/plugin-transform-modules-commonjs'
  ]
};
