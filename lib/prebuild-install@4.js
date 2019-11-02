'use strict'

const path = require('path')
const fs = require('fs')

// Read prebuilds in the style of `prebuild`, return in `prebuildify` format.
exports.prebuilds = function (name, version, dir) {
  return fs.readdirSync(dir).map(function (subdir) {
    if (subdir === '.dummy') return

    const scopeless = name.split('/').pop()
    const prefix = `${scopeless}-v${version}-`

    // E.g. {name}-v{version}-{runtime}-v{abi}-{platform}{libc}-{arch}.tar.gz
    if (!subdir.startsWith(prefix)) throw new Error('Unsupported format: ' + subdir)

    const a = subdir.slice(prefix.length).split('-')
    const tags = {}

    if (a[0] === 'node' && a[1] === 'webkit') {
      a[0] = 'node-webkit'
      a.splice(1, 1)
    }

    if (a.length !== 4) throw new Error('Unsupported format: ' + subdir)

    const [runtime, abi, platformLibc, arch] = a

    if (runtime === 'napi') {
      tags.runtime = 'node'
      tags.napi = true
      tags.napiVersion = abi.slice(1)
    } else {
      tags.runtime = runtime
      tags.abi = abi.slice(1)
    }

    if (platformLibc.endsWith('glibc')) {
      tags.platform = platformLibc.slice(0, -'glibc'.length)
      tags.libc = 'glibc'
    } else if (platformLibc.endsWith('musl')) {
      tags.platform = platformLibc.slice(0, -'musl'.length)
      tags.libc = 'musl'
    } else {
      tags.platform = platformLibc
    }

    tags.arch = arch

    if (tags.arch === 'arm64') tags.armv = '8'
    if (tags.arch === 'armv8') tags.armv = '8'
    if (tags.arch === 'armv7') tags.armv = '7'
    if (tags.arch === 'armv6') tags.armv = '6'

    const release = path.join(dir, subdir, 'build', 'Release')
    const files = fs.readdirSync(release).filter(name => /\.node$/.test(name))

    if (!files.length) {
      throw new Error('Could not find *.node in: ' + release)
    }

    if (files.length === 1) {
      tags.file = path.join(release, files[0])
    } else {
      // Got multiple *.node files, don't know what is the main addon.
      tags.file = null
    }

    return tags
  }).filter(Boolean)
}
