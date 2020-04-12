/* eslint-env mocha */

const { expect } = require('chai')
const sinon = require('sinon')

const launcher = require('../index')

describe('isJSFlags()', () => {
  const { isJSFlags } = launcher.test

  it('should return true if flag begins with --js-flags=', () => {
    expect(isJSFlags('--js-flags=--expose-gc')).to.be.eql(true)
    expect(isJSFlags('--js-flags="--expose-gc"')).to.be.eql(true)
    expect(isJSFlags("--js-flags='--expose-gc'")).to.be.eql(true)
  })

  it('should return false if flag does not begin with --js-flags=', () => {
    expect(isJSFlags(' --js-flags=--expose-gc')).to.be.eql(false)
    expect(isJSFlags('--js-flags"--expose-gc"')).to.be.eql(false)
    expect(isJSFlags('--jsflags="--expose-gc"')).to.be.eql(false)
  })
})

describe('sanitizeJSFlags()', () => {
  const { sanitizeJSFlags } = launcher.test

  it('should do nothing if flags are not contained in quotes', () => {
    expect(sanitizeJSFlags('--js-flags=--expose-gc')).to.be.eql('--js-flags=--expose-gc')
  })

  it('should symmetrically remove single or double quote if wraps all flags', () => {
    expect(sanitizeJSFlags("--js-flags='--expose-gc'")).to.be.eql('--js-flags=--expose-gc')
    expect(sanitizeJSFlags('--js-flags="--expose-gc"')).to.be.eql('--js-flags=--expose-gc')
  })

  it('should NOT remove anything if the flags are not contained within quote', () => {
    expect(sanitizeJSFlags('--js-flags=--expose-gc="true"')).to.be.eql('--js-flags=--expose-gc="true"')
    expect(sanitizeJSFlags("--js-flags=--expose-gc='true'")).to.be.eql("--js-flags=--expose-gc='true'")
  })
})

describe('canaryGetOptions', () => {
  const { canaryGetOptions } = launcher.test

  it('should return a merged version of --js-flags', () => {
    const parent = sinon.stub().returns(['-incognito'])
    const context = {}
    const url = 'http://localhost:9876'
    const args = { flags: ['--js-flags="--expose-gc"'] }
    expect(canaryGetOptions.call(context, url, args, parent)).to.be.eql([
      '-incognito',
      '--js-flags=--expose-gc --nocrankshaft --noopt'
    ])
  })
})

describe('headlessGetOptions', () => {
  const { headlessGetOptions } = launcher.test

  it('should return the headless flags', () => {
    const parent = sinon.stub().returns(['-incognito'])
    const context = {}
    const url = 'http://localhost:9876'
    const args = {}
    expect(headlessGetOptions.call(context, url, args, parent)).to.include.members([
      '-incognito',
      '--headless',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--remote-debugging-port=9222'
    ])
  })

  it('should not overwrite custom remote-debugging-port', () => {
    const parent = sinon.stub().returns(
      ['-incognito', '--remote-debugging-port=9333']
    )
    const context = {}
    const url = 'http://localhost:9876'
    const args = {}
    expect(headlessGetOptions.call(context, url, args, parent)).to.include.members([
      '-incognito',
      '--remote-debugging-port=9333',
      '--headless',
      '--disable-gpu',
      '--disable-dev-shm-usage'
    ])
  })
})
