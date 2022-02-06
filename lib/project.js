'use strict'

const Package = require('nice-package')
const get = require('simple-get')
const sanitize = require('sanitize-filename')
const semver = require('semver')
const memoize = require('thunky-with-args')
const packument = memoize(require('packument').factory({ full: true }))
const getPackage = require('packument-package').factory(packument)
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')
const util = require('util')
const download = require('./download')
const downloadTarball = require('./download-tarball')
const ngb4 = require('./node-gyp-build@4')
const ngb3 = require('./node-gyp-build@3')
const pi4 = require('./prebuild-install@4')
const sass4 = require('./node-sass@4')
const types = require('./data/types')

const NODE_GYP_RE = /node-gyp( configure)? (re)?build/

module.exports = class Project {
  constructor (pkg, opts) {
    const { cwd, ...options } = opts || {}

    this.pkg = new Package(pkg)
    this.name = this.pkg.name
    this.version = this.pkg.version
    this.title = this.name + '@' + this.version
    this.options = options
    this.cache = path.resolve(cwd || '.', 'cache', 'project', safePath(this.name))
    this.type = null
    this.language = null
    this.prebuilds = []
    this.downloadCount = 0

    fs.mkdirSync(this.cache, { recursive: true })
  }

  hasNodeAPI () {
    if (hasDependency(this.pkg, 'node-addon-api')) return true
    if (hasDependency(this.pkg, 'napi-macros')) return true
    if (this.pkg.name === 'fsevents') return true

    for (const prebuild of this.prebuilds) {
      if (prebuild.napi) return true
    }

    return false
  }

  platforms () {
    const triples = new Set()
    const index = new Set()

    for (const prebuild of this.prebuilds) {
      const platform = prebuild.platform
      const triple = platformTriple(prebuild)

      index.add(platform)
      index.add(triple)
      triples.add(triple)
    }

    if (this.pkg.name === 'leveldown' && !index.has('freebsd')) {
      triples.add('freebsd')
    }

    if (Array.isArray(this.pkg.os) && this.pkg.os.length) {
      for (const os of this.pkg.os) {
        if (!index.has(os)) triples.add(os)
      }
    }

    return Array.from(triples).filter(Boolean)
  }

  hydrateDownloadCount (callback) {
    const cached = path.join(this.cache, 'downloads_30d.json')

    fs.readFile(cached, 'utf8', (err, json) => {
      if (!err && json && json[0] === '{') {
        const { downloads, updated } = JSON.parse(json)

        if (Date.now() - updated < 1e3 * 60 * 60 * 24 * 31) {
          this.downloadCount = downloads
          return callback(null, downloads)
        }
      }

      get.concat({
        url: `https://api.npmjs.org/downloads/point/last-month/${this.name}`,
        json: true
      }, (err, res, data) => {
        if (err) return callback(err)
        if (res.statusCode !== 200) return callback(new Error(`HTTP ${res.statusCode}`))

        const downloads = data.downloads
        const json = JSON.stringify({ downloads, updated: Date.now() })

        fs.writeFile(cached, json, (err) => {
          if (err) return callback(err)
          this.downloadCount = downloads
          callback(null, downloads)
        })
      })
    })
  }

  // TODO: refactor
  // TODO: could be using e.g. cmake-js to build, but node-pre-gyp to
  // prebuild. Split detection into language, build tool and prebuild tool.
  // TODO: normalize scripts (remove npx, remove npm run wrappers, remove echo's, etc)
  hydrateType () {
    const pkg = this.pkg

    if (types.has(pkg.name)) {
      this.type = types.get(pkg.name)
    } else if (/^@tensorflow\/tfjs-node/.test(pkg.name) ||
      /^@nut-tree\/libnut-(linux|win32|darwin)$/.test(pkg.name) || // prebuilts included in package tarball
      /^@teradataprebuilt\/fastcall-.+/.test(pkg.name) ||
      /^node do_prebuild\.js/.test(script(pkg, 'postinstall'))) {
      this.type = 'custom'
    } else if (/(^|\/)wrtc$/.test(pkg.name) && pkg.dependsOn('node-pre-gyp')) {
      this.type = 'node-pre-gyp'
    } else if (/(^|\/)wrtc$/.test(pkg.name) && pkg.dependsOn('@mapbox/node-pre-gyp')) {
      this.type = '@mapbox/node-pre-gyp'
    } else if (pkg.name === 'deltachat-node' && assert(pkg, pkg.dependsOn('node-gyp-build'))) {
      this.type = 'node-gyp-build'
      this.language = 'rust'
    } else if (pkg.name === '@ckb-lumos/indexer' || pkg.name === 'merk' || /^@jolocom\/native-core-node-.+/.test(pkg.name)) {
      this.type = 'custom'
      this.language = 'rust'
    } else if (pkg.name === 'node-rfc') {
      this.type = 'prebuild-install' // also uses cmake-js
    } else if (pkg.dependsOn('prebuild-install') && pkg.name === 'node-aead-crypto' && pkg.scripts.install === 'node lib/install.js') {
      this.type = 'prebuild-install' // has a custom step before delegating to prebuild-install
    } else if (pkg.dependsOn('prebuild-install') && assert(pkg, matchInstallScript(pkg, /prebuild-install/))) {
      this.type = 'prebuild-install'
    } else if (pkg.dependsOn('node-gyp-build') && (matchInstallScript(pkg, NODE_GYP_RE) || redirectedScript(pkg, 'install', NODE_GYP_RE) || /^win-sso$/.test(pkg.name))) {
      this.type = 'node-gyp' // node-gyp-build is rendered ineffective
    } else if (pkg.dependsOn('node-gyp-build') && !script(pkg, 'install') && !script(pkg, 'postinstall')) {
      this.type = 'node-gyp-build' // has no install script (which is OK if prebuilds are included)
    } else if (pkg.dependsOn('node-gyp-build') && script(pkg, 'install') === 'echo using prebuilds') {
      this.type = 'node-gyp-build' // has no install script (which is OK if prebuilds are included)
    } else if (pkg.dependsOn('node-gyp-build') && assert(pkg, matchInstallScript(pkg, /node-gyp-build/))) {
      this.type = 'node-gyp-build'
    } else if (pkg.dependsOn('neon-cli') && pkg.dependsOn('node-pre-gyp') && pkg.name === 'opencl-info') {
      this.type = 'node-pre-gyp'
      this.language = 'rust'
    } else if (pkg.dependsOn('neon-load-or-build') && matchInstallScript(pkg, /neon-load-or-build/)) {
      this.type = 'neon-load-or-build'
      this.language = 'rust'
    } else if (pkg.dependsOn('node-pre-gyp') && /^stt|(deepspeech(-gpu)?)$/.test(pkg.name) && Object.keys(pkg.scripts).join() === 'test') {
      this.type = 'custom' // has no install script, but pkg size indicates prebuilds are included (I didn't check)
    } else if (pkg.dependsOn('node-pre-gyp') && assert(pkg, matchInstallScript(pkg, /node-pre-gyp/))) {
      this.type = 'node-pre-gyp'
    } else if (pkg.dependsOn('@mapbox/node-pre-gyp') && matchInstallScript(pkg, NODE_GYP_RE)) {
      this.type = 'node-gyp' // node-pre-gyp is not used
    } else if (pkg.dependsOn('@mapbox/node-pre-gyp') &&
      /^(wdeasync|bufferfromfile|w\.process\.tree\.windows)$/.test(pkg.name) &&
      Object.keys(pkg.scripts).some(k => /node-pre-gyp /.test(pkg.scripts[k]))) {
      this.type = '@mapbox/node-pre-gyp' // redundant wrapper
    } else if (pkg.dependsOn('@mapbox/node-pre-gyp') && assert(pkg, matchInstallScript(pkg, /node-pre-gyp /) || redirectedScript(pkg, 'install', /node-pre-gyp /) || pkg.name === '@koush/opencv4nodejs')) {
      this.type = '@mapbox/node-pre-gyp'
    } else if ((pkg.dependsOn('@risingstack/node-pre-gyp') || pkg.dependsOn('@discordjs/node-pre-gyp')) &&
      assert(pkg, matchInstallScript(pkg, /node-pre-gyp/))) {
      this.type = 'node-pre-gyp' // 1K-10K weekly downloads; no need to differentiate
    } else if (pkg.dependsOn('neon-cli') && (matchInstallScript(pkg, /neon build/) || redirectedScript(pkg, 'postinstall', /neon build/))) {
      this.type = 'neon-cli'
      this.language = 'rust'
    } else if (pkg.dependsOn('neon-cli') && pkg.bin && typeof pkg.bin === 'object' && Object.keys(pkg.bin).some(k => pkg.bin[k] === 'native/index.node')) {
      assert(pkg, !script(pkg, 'install') && !script(pkg, 'postinstall'))
      this.type = 'custom' // TODO: use special category for tarballs that ship a single prebuilt binary (if it's common)
      this.language = 'rust'
    } else if (pkg.somehowDependsOn('cargo-cp-artifact') && !script(pkg, 'install') && !script(pkg, 'postinstall') && /\.node$/.test(pkg.main)) {
      this.type = 'custom' // TODO: use special category for tarballs that ship a single prebuilt binary (if it's common)
      this.language = 'rust'
    } else if (pkg.somehowDependsOn('cargo-cp-artifact') && matchInstallScript(pkg, /^node /)) {
      this.type = 'custom'
      this.language = 'rust'
    } else if (pkg.somehowDependsOn('cargo-cp-artifact') && assert(pkg, matchInstallScript(pkg, /(npx )?cargo-cp-artifact/) || redirectedScript(pkg, 'install', /(npx )?cargo-cp-artifact/))) {
      this.type = 'cargo-cp-artifact'
      this.language = 'rust'
    } else if (pkg.dependsOn('node-cmake') && matchInstallScript(pkg, NODE_GYP_RE)) {
      this.type = 'node-gyp' // uses node-gyp to build
    } else if (pkg.dependsOn('node-cmake') && assert(pkg, matchInstallScript(pkg, /ncmake (re)?build/))) {
      this.type = 'node-cmake'
    } else if (pkg.dependsOn('cmake-js') && pkg.name === 'leveldb-zlib' && script(pkg, 'install') === 'node buildChecks.js') {
      this.type = 'cmake-js' // at quick glance, seems to eventually spawn cmake-js
    } else if (pkg.dependsOn('cmake-js') && matchInstallScript(pkg, /cmake-js( -[a-zA-Z_=-]+)? (compile|build)/)) {
      this.type = 'cmake-js'
    } else if (matchInstallScript(pkg, NODE_GYP_RE) || redirectedScript(pkg, 'install', NODE_GYP_RE) || pkg.gypfile) {
      this.type = 'node-gyp'
    } else if (pkg.gypfile === false) {
      return false
    } else {
      // TODO: check if a binding.gyp exists
      // assert(pkg, this.downloadCount < 1e3)
      return false
    }

    return true
  }

  hydratePrebuilds (callback) {
    if (hasDependency(this.pkg, 'node-gyp-build')) {
      const dest = path.join(this.cache, safePath(this.version), 'npm')

      return downloadTarball(this.pkg.name, this.pkg.version, dest, (err) => {
        if (err) return callback(err)

        if (hasDependency(this.pkg, 'node-gyp-build', '>=4')) {
          this.type = 'node-gyp-build@4'
          this.prebuilds = ngb4.prebuilds(path.join(dest, 'package'))
        } else if (hasDependency(this.pkg, 'node-gyp-build', '>=3')) {
          this.type = 'node-gyp-build@3'
          this.prebuilds = ngb3.prebuilds(path.join(dest, 'package'))
        }

        callback()
      })
    } else if (hasDependency(this.pkg, 'prebuild-install', '>=3')) {
      if (this.pkg.binary) {
        // Stored on e.g. S3 or using custom names. Can't discover files.
        return process.nextTick(callback)
      } else if (
        (this.pkg.name === 'integer' && this.pkg.version === '4.0.0') ||
        (this.pkg.name === 'mac-screen-capture-permissions' && this.pkg.version === '2.0.0')) {
        // Release didn't include prebuilt binaries
        return process.nextTick(callback)
      }

      const dest = path.join(this.cache, safePath(this.version), 'prebuilds')

      return download(this.pkg, dest, this.options.githubAuth, (err) => {
        if (err) return callback(err)

        try {
          this.prebuilds = pi4.prebuilds(this.name, this.version, dest)
        } catch (err) {
          return callback(err)
        }

        callback()
      })
    } else if (hasDependency(this.pkg, 'node-pre-gyp')) {
      // Stored on e.g. S3 or using custom names. Can't discover files.
    } else if (this.pkg.name === 'node-sass') {
      // Most popular addon, so making an exception for its custom install script.
      const dest = path.join(this.cache, safePath(this.version), 'prebuilds')

      return download(this.pkg, dest, this.options.githubAuth, (err) => {
        if (err) return callback(err)

        try {
          this.type = 'custom'
          this.prebuilds = sass4.prebuilds(dest)
        } catch (err) {
          return callback(err)
        }

        callback()
      })
    }

    process.nextTick(callback)
  }

  static from (spec, callback) {
    if (typeof spec === 'string') {
      const [name, version, ...rest] = spec.split(/(?<!^)@/)

      if (!name || rest.length) {
        throw new Error('Invalid spec: ' + spec)
      }

      getPackage(name, version || 'latest', (err, pkg) => {
        if (err) return callback(err)
        callback(null, new Project(pkg))
      })
    } else if (typeof spec === 'object' && spec !== null) {
      process.nextTick(callback, null, new Project(spec))
    } else {
      throw new TypeError('Invalid spec')
    }
  }
}

function platformTriple ({ platform, arch, libc, armv }) {
  armv = armv ? 'armv' + armv : ''
  platform = [platform, arch].filter(Boolean).join('-')
  return [platform, libc, armv].filter(Boolean).join('.')
}

function script (pkg, name) {
  return pkg.scripts && pkg.scripts[name]
}

const redirectedScript = (pkg, scriptName, re, recurse) => {
  const cmd = script(pkg, scriptName)
  const match = /(?:^|&& )npm run ([a-zA-Z0-9:\-_]+)$/.exec(cmd)

  if (match) {
    const forwardTo = match[1]
    if (re.test(script(pkg, forwardTo))) return true
    if (recurse !== false && redirectedScript(pkg, forwardTo, re, false)) return true
  }

  const match2 = /^npm run ([a-zA-Z0-9:\-_]+)/.exec(cmd)

  if (match2) {
    const forwardTo = match2[1]
    if (re.test(script(pkg, forwardTo))) return true
    if (recurse !== false && redirectedScript(pkg, forwardTo, re, false)) return true
  }
}

function matchInstallScript (pkg, re) {
  return pkg.scripts && (
    re.test(pkg.scripts.install) ||
    re.test(pkg.scripts.preinstall) ||
    re.test(pkg.scripts.postinstall)
  )
}

function hasDependency (pkg, id, range) {
  if (!pkg.dependencies || !pkg.dependencies[id]) return false
  if (!range) return true

  try {
    return semver.satisfies(semver.minVersion(pkg.dependencies[id]), range)
  } catch (_) {
    return false
  }
}

function safePath (str) {
  return str.split('/').map(part => {
    const safe = sanitize(part)

    if (part === safe) {
      return part
    } else {
      const md5 = crypto.createHash('md5').update(part).digest('hex')
      return `${safe}_${md5(part)}`
    }
  }).join('/')
}

function assert (pkg, v) {
  if (!v) {
    const { versions, owners, licenseText, noticeText, other, ...rest } = pkg
    console.error(util.inspect(rest, { colors: true, depth: 10 }))
    throw new Error('Unexpected result')
  }

  return v
}
