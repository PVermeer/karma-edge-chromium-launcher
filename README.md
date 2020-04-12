# karma-edge-chromium-launcher

Forked from <https://github.com/matracey/karma-edgium-launcher>
Removed fork relation because this is a deep nested fork to <https://github.com/karma-runner/karma-chrome-launcher>

[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/koddsson/karma-edgium-launcher)
 [![npm version](https://img.shields.io/npm/v/karma-edgium-launcher.svg?style=flat-square)](https://www.npmjs.com/package/karma-edgium-launcher) [![npm downloads](https://img.shields.io/npm/dm/karma-edgium-launcher.svg?style=flat-square)](https://www.npmjs.com/package/karma-edgium-launcher)

[![Build Status](https://img.shields.io/travis/koddsson/karma-edgium-launcher/master.svg?style=flat-square)](https://travis-ci.org/koddsson/karma-edgium-launcher) [![Dependency Status](https://img.shields.io/david/koddsson/karma-edgium-launcher.svg?style=flat-square)](https://david-dm.org/koddsson/karma-edgium-launcher) [![devDependency Status](https://img.shields.io/david/dev/koddsson/karma-edgium-launcher.svg?style=flat-square)](https://david-dm.org/koddsson/karma-edgium-launcher#info=devDependencies)

> Launcher for Edge and Edge Canary.

## Installation

The easiest way is to keep `karma-edgium-launcher` as a devDependency in your `package.json`,
by running

```bash
npm i -D karma-edgium-launcher
```

## Configuration

```js
// karma.conf.js
module.exports = function(config) {
  config.set({
    browsers: ['Edge', 'Edge_without_security'], // You may use 'EdgeCanary', 'EdgeBeta' or any other supported browser

    // you can define custom flags
    customLaunchers: {
      Edge_without_security: {
        base: 'Edge',
        flags: ['--disable-web-security', '--disable-site-isolation-trials']
      }
    }
  })
}
```

The `--user-data-dir` is set to a temporary directory but can be overridden on a custom launcher as shown below.
One reason to do this is to have a permanent Edge user data directory inside the project directory to be able to
install plugins there (e.g. JetBrains IDE Support plugin).

```js
customLaunchers: {
  Edge_with_debugging: {
    base: 'Edge',
    edgeDataDir: path.resolve(__dirname, '.edge')
  }
}
```

You can pass list of browsers as a CLI argument too:

```bash
karma start --browsers Edge,Edge_without_security
```

### Available Browsers

*Note: Headless mode requires a browser version >= 59*

- Edge (EDGE_BIN)
- EdgeHeadless (EDGE_BIN)
- EdgeBeta (EDGE_BETA_BIN)
- EdgeBetaHeadless (EDGE_BETA_BIN)
- EdgeDev (EDGE_DEV_BIN)
- EdgeDevHeadless (EDGE_DEV_BIN)
- EdgeCanary (EDGE_CANARY_BIN)
- EdgeCanaryHeadless (EDGE_CANARY_BIN)
- Dartium (DARTIUM_BIN)

#### Usage

```bash
npm i -D puppeteer karma-edgium-launcher
```

```js
// karma.conf.js
process.env.EDGE_BIN = require('puppeteer').executablePath()

module.exports = function(config) {
  config.set({
    browsers: ['EdgeHeadless']
  })
}
```

----

For more information on Karma see the [homepage].

[homepage]: http://karma-runner.github.com
