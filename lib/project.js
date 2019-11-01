'use strict'

const Package = require('nice-package')
const get = require('simple-get')
const sanitize = require('sanitize-filename')
const semver = require('semver')
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')
const download = require('./download')
const downloadTarball = require('./download-tarball')
const ngb4 = require('./node-gyp-build@4')
const ngb3 = require('./node-gyp-build@3')
const pi4 = require('./prebuild-install@4')

module.exports = class Project {
  constructor (pkg, opts) {
    const { id, dir, cwd, ...options } = opts || {}

    this.pkg = new Package(pkg)
    this.name = this.pkg.name
    this.version = this.pkg.version
    this.title = this.name + '@' + this.version
    this.options = options
    this.cache = path.resolve(cwd || '.', 'cache', safePath(this.name))
    this.type = null
    this.language = null
    this.prebuilds = []
    this.downloadCount = 0

    fs.mkdirSync(this.cache, { recursive: true })

    // Optional, if package is installed locally
    this.id = id
    this.dir = dir
  }

  hasNapi () {
    if (hasDependency(this.pkg, 'node-addon-api')) return true
    if (hasDependency(this.pkg, 'napi-macros')) return true

    for (const prebuild of this.prebuilds) {
      if (prebuild.napi) return true
    }

    return false
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
    } else if (pkg.dependsOn('node-cmake') && /ncmake (re)?build/.test(script(pkg, 'install'))) {
      this.type = 'node-cmake'
    } else if (pkg.dependsOn('prebuild') && /prebuild --install/.test(script(pkg, 'install'))) {
      this.type = 'prebuild'
    } else if (pkg.dependsOn('prebuild') && /prebuild --download/.test(script(pkg, 'install'))) {
      this.type = 'prebuild'
    } else if (/node-gyp (re)?build/.test(script(pkg, 'install'))) {
    } else if (/node-gyp (re)?build/.test(script(pkg, 'preinstall'))) {
    } else if (pkg.gypfile && script(pkg, 'install')) {
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

      return download(this.pkg, dest, (err) => {
        if (err) return callback(err)

        try {
          this.prebuilds = pi4.prebuilds(this.name, this.version, dest)
        } catch (err) {
          return callback(err)
        }

        callback()
      })
    }

    process.nextTick(callback)
  }
}

function script (pkg, name) {
  return pkg.scripts && pkg.scripts[name]
}

function hasDependency (pkg, id, range) {
  if (!pkg.dependencies || !pkg.dependencies[id]) return false
  if (!range) return true
  return semver.satisfies(semver.minVersion(pkg.dependencies[id]), range)
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
