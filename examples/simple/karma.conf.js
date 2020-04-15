const karmaEdgeLauncher = require('../../')

module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['mocha'],
    plugins: [
      karmaEdgeLauncher,
      'karma-mocha'
    ],
    files: [
      '*.js'
    ],
    exclude: [],
    reporters: ['progress'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: false,
    singleRun: true,
    browsers: ['EdgeHeadless']
  })
}
