/* eslint-disable space-before-function-paren */
// @ts-check
const fs = require('fs')
const path = require('path')
const isWsl = require('is-wsl')
const { execSync, exec, spawn } = require('child_process')
const which = require('which')
const { StringDecoder } = require('string_decoder')

function isJSFlags(flag) {
  return flag.indexOf('--js-flags=') === 0
}

function sanitizeJSFlags(flag) {
  const test = /--js-flags=(['"])/.exec(flag)
  if (!test) {
    return flag
  }
  const escapeChar = test[1]
  const endExp = new RegExp(`${escapeChar}$`)
  const startExp = new RegExp(`--js-flags=${escapeChar}`)
  return flag.replace(startExp, '--js-flags=').replace(endExp, '')
}

function getBin(commands) {
  // Don't run these checks on win32
  if (process.platform !== 'linux') {
    return null
  }
  var bin, i
  for (i = 0; i < commands.length; i++) {
    try {
      if (which.sync(commands[i])) {
        bin = commands[i]
        break
      }
    } catch (e) { }
  }
  return bin
}

function getEdgeExe(edgeDirName) {
  // Only run these checks on win32
  if (process.platform !== 'win32') {
    return null
  }
  let windowsEdgeDirectory
  let i
  let
    prefix
  const suffix = `Microsoft\\${edgeDirName}\\Application\\msedge.exe`
  const prefixes = [process.env.LOCALAPPDATA, process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']]
  const errors = []

  for (i = 0; i < prefixes.length; i += 1) {
    prefix = prefixes[i]
    try {
      windowsEdgeDirectory = path.join(prefix, suffix)
      fs.accessSync(windowsEdgeDirectory)
      return windowsEdgeDirectory
    } catch (e) {
      errors.push(e)
    }
  }
  return windowsEdgeDirectory
}

const getAllPrefixesWsl = function () {
  const drives = []
  // Some folks configure their wsl.conf to mount Windows drives without the
  // /mnt prefix (e.g. see https://nickjanetakis.com/blog/setting-up-docker-for-windows-and-wsl-to-work-flawlessly)
  //
  // In fact, they could configure this to be any number of things. So we
  // take each path, convert it to a Windows path, check if it looks like
  // it starts with a drive and then record that.
  const re = /^([A-Z]):\\/i
  for (const pathElem of process.env.PATH.split(':')) {
    if (fs.existsSync(pathElem)) {
      const windowsPath = execSync('wslpath -w "' + pathElem + '"').toString()
      const matches = windowsPath.match(re)
      if (matches !== null && drives.indexOf(matches[1]) === -1) {
        drives.push(matches[1])
      }
    }
  }

  const result = []
  // We don't have the PROGRAMFILES or PROGRAMFILES(X86) environment variables
  // in WSL so we just hard code them.
  const prefixes = ['Program Files', 'Program Files (x86)']
  for (const prefix of prefixes) {
    for (const drive of drives) {
      // We only have the drive, and only wslpath knows exactly what they map to
      // in Linux, so we convert it back here.
      const wslPath =
        execSync('wslpath "' + drive + ':\\' + prefix + '"').toString().trim()
      result.push(wslPath)
    }
  }

  return result
}

const getEdgeExeWsl = function (edgeDirName) {
  if (!isWsl) {
    return null
  }

  const edgeDirNames = Array.prototype.slice.call(arguments)

  for (const prefix of getAllPrefixesWsl()) {
    for (const dir of edgeDirNames) {
      const candidate = path.join(prefix, 'Microsoft', dir, 'Application', 'msedge.exe')
      if (fs.existsSync(candidate)) {
        return candidate
      }
    }
  }

  return path.join('/mnt/c/Program Files/', 'Microsoft', edgeDirNames[0], 'Application', 'msedge.exe')
}

function getEdgeDarwin(defaultPath) {
  if (process.platform !== 'darwin') {
    return null
  }

  try {
    const homePath = path.join(process.env.HOME, defaultPath)
    fs.accessSync(homePath)
    return homePath
  } catch (e) {
    return defaultPath
  }
}

function getHeadlessOptions(url, args, parent) {
  const mergedArgs = parent.call(this, url, args).concat([
    '--headless',
    '--disable-gpu',
    '--disable-dev-shm-usage'
  ])

  if (isWsl) { mergedArgs.push('--no-sandbox') }

  const isRemoteDebuggingFlag = (flag) => (flag || '').indexOf('--remote-debugging-port=') !== -1

  return mergedArgs.some(isRemoteDebuggingFlag) ? mergedArgs : mergedArgs.concat(['--remote-debugging-port=9222'])
}

function getCanaryOptions(url, args, parent) {
  // disable crankshaft optimizations, as it causes lot of memory leaks (as of Edge 23.0)
  const flags = args.flags || []
  let augmentedFlags
  const customFlags = '--nocrankshaft --noopt'

  flags.forEach((flag) => {
    if (isJSFlags(flag)) {
      augmentedFlags = `${sanitizeJSFlags(flag)} ${customFlags}`
    }
  })

  return parent.call(this, url).concat([augmentedFlags || `--js-flags=${customFlags}`])
}

const EdgeBrowser = function (baseBrowserDecorator, args) {
  baseBrowserDecorator(this)
  let windowsUsed = false
  let browserProcessPid

  const flags = args.flags || []
  const userDataDir = args.edgeDataDir || this._tempDir

  this._getOptions = function () {
    // Edge CLI options
    // http://peter.sh/experiments/chromium-command-line-switches/
    flags.forEach((flag, i) => {
      if (isJSFlags(flag)) {
        flags[i] = sanitizeJSFlags(flag)
      }
    })

    return [
      // https://github.com/GoogleChrome/chrome-launcher/blob/master/docs/chrome-flags-for-tools.md#--enable-automation
      '--enable-automation',
      '--no-default-browser-check',
      '--no-first-run',
      '--disable-default-apps',
      '--disable-popup-blocking',
      '--disable-translate',
      '--disable-background-timer-throttling',
      // on macOS, disable-background-timer-throttling is not enough
      // and we need disable-renderer-backgrounding too
      // see https://github.com/karma-runner/karma-chrome-launcher/issues/123
      '--disable-renderer-backgrounding',
      '--disable-device-discovery-notifications'
    ].concat(flags)
  }

  this._start = (url) => {
    var command = this._getCommand()
    let runningProcess

    const useWindowsWSL = () => {
      console.log('WSL: using Windows')
      windowsUsed = true

      const translatedUserDataDir = execSync('wslpath -w ' + userDataDir).toString().trim()

      // Translate command to a windows path to make it possisible to get the pid.
      let commandPrepare = this.DEFAULT_CMD.win32.split('/')
      const executable = commandPrepare.pop()
      commandPrepare = commandPrepare.join('/')
        .replace(/\s/g, '\\ ')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
      const commandTranslatePath = execSync('wslpath -w ' + commandPrepare).toString().trim()
      const commandTranslated = commandTranslatePath + '\\' + executable

      /*
      Custom launch implementation to get pid via wsl interop:
      Start edge on windows and send process id back via stderr (mozilla strategy).
      */
      this._execCommand = spawn('/bin/bash', ['-c',
        `
        processString=$(wmic.exe process call create "${commandTranslated}\
        ${url}\
        --user-data-dir=${translatedUserDataDir}\
        ${this._getOptions().join(' ')}\
        ");

        while IFS= read -r line; do
          if [[ $line == *"ProcessId = "* ]]; then
      
            removePrefix=\${line#*ProcessId = }
            removeSuffix=\${removePrefix%;*}
            pid=$removeSuffix
    
            debugString="BROWSERBROWSERBROWSERBROWSER debug me @ $pid"
            echo >&2 "$debugString"
            exit 0
      
          fi
        done < <(printf '%s\n' "$processString")
        exit 0;
        `]
      )

      runningProcess = this._execCommand
    }

    const useNormal = () => {
      this._execCommand(
        command,
        [url, `--user-data-dir=${userDataDir}`].concat(this._getOptions())
      )

      runningProcess = this._process
    }

    if (isWsl) {
      if (!this.DEFAULT_CMD.linux || !which.sync(this.DEFAULT_CMD.linux, { nothrow: true })) {
        // If Edge is not installed on Linux side then always use windows.
        useWindowsWSL()
      } else {
        if (!this._getOptions().includes('--headless') && !process.env.DISPLAY) {
          // If not in headless mode it will fail so use windows in that case.
          useWindowsWSL()
        } else {
          // Revert back to Linux command.
          command = this.DEFAULT_CMD.linux
          useNormal()
        }
      }
    } else {
      useNormal()
    }

    // @ts-ignore
    runningProcess.stderr.on('data', errBuff => {
      var errString
      if (typeof errBuff === 'string') {
        errString = errBuff
      } else {
        var decoder = new StringDecoder('utf8')
        errString = decoder.write(errBuff)
      }
      var matches = errString.match(/BROWSERBROWSERBROWSERBROWSER\s+debug me @ (\d+)/)
      if (matches) {
        browserProcessPid = parseInt(matches[1], 10)
      }
    })
  }

  this.on('kill', function (done) {
    // If we have a separate browser process PID, try killing it.
    if (browserProcessPid) {
      try {
        windowsUsed
          ? exec(`Taskkill.exe /PID ${browserProcessPid} /F /FI "STATUS eq RUNNING"`)
          : process.kill(browserProcessPid)
      } catch (e) {
        // Ignore failure -- the browser process might have already been
        // terminated.
      }
    }

    return process.nextTick(done)
  })
}

EdgeBrowser.prototype = {
  name: 'Edge',

  DEFAULT_CMD: {
    linux: getBin(['msedge']), // No release on Linux yet
    darwin: getEdgeDarwin('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'),
    win32: isWsl ? getEdgeExeWsl('Edge') : getEdgeExe('Edge')
  },
  ENV_CMD: 'EDGE_BIN'
}

EdgeBrowser.$inject = ['baseBrowserDecorator', 'args']

const EdgeHeadlessBrowser = function (...args) {
  EdgeBrowser.apply(this, args)
  const parentOptions = this._getOptions
  this._getOptions = (url) => getHeadlessOptions.call(this, url, args[1], parentOptions)
}
EdgeHeadlessBrowser.prototype = {
  name: 'EdgeHeadless',

  DEFAULT_CMD: {
    linux: getBin(['msedge']), // No release on Linux yet
    darwin: getEdgeDarwin('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'),
    win32: isWsl ? getEdgeExeWsl('Edge') : getEdgeExe('Edge')
  },
  ENV_CMD: 'EDGE_BIN'
}
EdgeHeadlessBrowser.$inject = ['baseBrowserDecorator', 'args']

const EdgeBetaBrowser = function (...args) {
  EdgeBrowser.apply(this, args)
}
EdgeBetaBrowser.prototype = {
  name: 'EdgeBeta',

  DEFAULT_CMD: {
    linux: getBin(['msedge-beta']), // No release on Linux yet
    darwin: getEdgeDarwin('/Applications/Microsoft Edge Beta.app/Contents/MacOS/Microsoft Edge Beta'),
    win32: isWsl ? getEdgeExeWsl('Edge Beta') : getEdgeExe('Edge Beta')
  },
  ENV_CMD: 'EDGE_BETA_BIN'
}
EdgeBetaBrowser.$inject = ['baseBrowserDecorator', 'args']

const EdgeBetaHeadlessBrowser = function (...args) {
  EdgeHeadlessBrowser.apply(this, args)
}
EdgeBetaHeadlessBrowser.prototype = {
  name: 'EdgeBetaHeadless',

  DEFAULT_CMD: {
    linux: getBin(['msedge-beta']), // No release on Linux yet
    darwin: getEdgeDarwin('/Applications/Microsoft Edge Beta.app/Contents/MacOS/Microsoft Edge Beta'),
    win32: isWsl ? getEdgeExeWsl('Edge Beta') : getEdgeExe('Edge Beta')
  },
  ENV_CMD: 'EDGE_BETA_BIN'
}
EdgeHeadlessBrowser.$inject = ['baseBrowserDecorator', 'args']

const EdgeDevBrowser = function (...args) {
  EdgeBrowser.apply(this, args)
}
EdgeDevBrowser.prototype = {
  name: 'EdgeDev',

  DEFAULT_CMD: {
    linux: getBin(['msedge-dev']), // No release on Linux yet
    darwin: getEdgeDarwin('/Applications/Microsoft Edge Dev.app/Contents/MacOS/Microsoft Edge Dev'),
    win32: isWsl ? getEdgeExeWsl('Edge Dev') : getEdgeExe('Edge Dev')
  },
  ENV_CMD: 'EDGE_DEV_BIN'
}
EdgeDevBrowser.$inject = ['baseBrowserDecorator', 'args']

const EdgeDevHeadlessBrowser = function (...args) {
  EdgeHeadlessBrowser.apply(this, args)
}
EdgeDevHeadlessBrowser.prototype = {
  name: 'EdgeDevHeadless',

  DEFAULT_CMD: {
    linux: getBin(['msedge-dev']), // No release on Linux yet
    darwin: getEdgeDarwin('/Applications/Microsoft Edge Dev.app/Contents/MacOS/Microsoft Edge Dev'),
    win32: isWsl ? getEdgeExeWsl('Edge Dev') : getEdgeExe('Edge Dev')
  },
  ENV_CMD: 'EDGE_DEV_BIN'
}
EdgeHeadlessBrowser.$inject = ['baseBrowserDecorator', 'args']

const EdgeCanaryBrowser = function (...args) {
  EdgeBrowser.apply(this, args)
  const parentOptions = this._getOptions
  this._getOptions = (url) => getCanaryOptions.call(this, url, args[1], parentOptions)
}
EdgeCanaryBrowser.prototype = {
  name: 'EdgeCanary',

  DEFAULT_CMD: {
    linux: getBin(['Edge SxS']), // No release on Linux yet
    darwin: getEdgeDarwin('/Applications/Microsoft Edge Canary.app/Contents/MacOS/Microsoft Edge Canary'),
    win32: isWsl ? getEdgeExeWsl('Edge SxS') : getEdgeExe('Edge SxS')
  },
  ENV_CMD: 'EDGE_CANARY_BIN'
}
EdgeCanaryBrowser.$inject = ['baseBrowserDecorator', 'args']

const EdgeCanaryHeadlessBrowser = function (...args) {
  EdgeCanaryBrowser.apply(this, args)
  const parentOptions = this._getOptions
  this._getOptions = (url) => getHeadlessOptions.call(this, url, args[1], parentOptions)
}
EdgeCanaryHeadlessBrowser.prototype = {
  name: 'EdgeCanaryHeadless',

  DEFAULT_CMD: {
    linux: getBin(['Edge SxS']), // No release on Linux yet
    darwin: getEdgeDarwin('/Applications/Microsoft Edge Canary.app/Contents/MacOS/Microsoft Edge Canary'),
    win32: isWsl ? getEdgeExeWsl('Edge SxS') : getEdgeExe('Edge SxS')
  },
  ENV_CMD: 'EDGE_CANARY_BIN'
}
EdgeCanaryHeadlessBrowser.$inject = ['baseBrowserDecorator', 'args']

// PUBLISH DI MODULE
module.exports = {
  'launcher:Edge': ['type', EdgeBrowser],
  'launcher:EdgeHeadless': ['type', EdgeHeadlessBrowser],
  'launcher:EdgeBeta': ['type', EdgeBetaBrowser],
  'launcher:EdgeBetaHeadless': ['type', EdgeBetaHeadlessBrowser],
  'launcher:EdgeDev': ['type', EdgeDevBrowser],
  'launcher:EdgeDevHeadless': ['type', EdgeDevHeadlessBrowser],
  'launcher:EdgeCanary': ['type', EdgeCanaryBrowser],
  'launcher:EdgeCanaryHeadless': ['type', EdgeCanaryHeadlessBrowser]
}

module.exports.test = {
  isJSFlags,
  sanitizeJSFlags,
  headlessGetOptions: getHeadlessOptions,
  canaryGetOptions: getCanaryOptions
}
