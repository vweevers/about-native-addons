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
const download = require('./download')
const downloadTarball = require('./download-tarball')
const ngb4 = require('./node-gyp-build@4')
const ngb3 = require('./node-gyp-build@3')
const pi4 = require('./prebuild-install@4')
const sass4 = require('./node-sass@4')

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

  hasNapi () {
    if (hasDependency(this.pkg, 'node-addon-api')) return true
    if (hasDependency(this.pkg, 'napi-macros')) return true

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

  hydrateType () {
    const pkg = this.pkg

    if (pkg.dependsOn('prebuild-install') && /prebuild-install/.test(script(pkg, 'install'))) {
      this.type = 'prebuild-install'
    } else if (pkg.dependsOn('node-gyp-build') && /node-gyp-build/.test(script(pkg, 'install'))) {
      this.type = 'node-gyp-build'
    } else if (pkg.dependsOn('node-pre-gyp') && /node-pre-gyp/.test(script(pkg, 'install'))) {
      this.type = 'node-pre-gyp'
    } else if (pkg.dependsOn('neon-cli') && /neon build/.test(script(pkg, 'install'))) {
      this.type = 'neon'
      this.language = 'rust'
    } else if (pkg.somehowDependsOn('cargo-cp-artifact')) {
      this.type = 'neon'
      this.language = 'rust'
    } else if (pkg.dependsOn('node-cmake') && /ncmake (re)?build/.test(script(pkg, 'install'))) {
      this.type = 'node-cmake'
    } else if (pkg.dependsOn('cmake-js') && /cmake-js /.test(script(pkg, 'install'))) {
      this.type = 'cmake-js'
    } else if (pkg.dependsOn('prebuild') && /prebuild --install/.test(script(pkg, 'install'))) {
      this.type = 'prebuild'
    } else if (pkg.dependsOn('prebuild') && /prebuild --download/.test(script(pkg, 'install'))) {
      this.type = 'prebuild'
    } else if (/node-gyp (re)?build/.test(script(pkg, 'install'))) {
      // No prebuilds
    } else if (/node-gyp (re)?build/.test(script(pkg, 'preinstall'))) {
      // No prebuilds
    } else if (pkg.gypfile && script(pkg, 'install')) {
      // No prebuilds
    } else {
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
          this.type = 'hand-rolled'
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
