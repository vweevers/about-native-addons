'use strict'

const path = require('path')
const readdirSync = require('./readdir-maybe')

// Read prebuilds in the style of `node-sass`, return in `prebuildify` format.
exports.prebuilds = function (dir) {
  return readdirSync(dir).map(function (file) {
    // $platform(_$variant)-$arch-$abi_binding.node
    if (!file.endsWith('_binding.node')) return

    const tags = {}
    const a = file.split('-')
    if (a.length !== 3) throw new Error('Unsupported format: ' + file)

    const [platformLibc, arch, abiSuffix] = a
    const [platform, libc] = platformLibc.split('_')
    const [abi] = abiSuffix.split('_')

    tags.runtime = 'node'
    tags.platform = platform
    tags.arch = arch
    tags.napi = false

    if (libc) {
      tags.libc = libc
    } else if (platform === 'linux') {
      tags.libc = 'glibc'
    }

    tags.abi = abi
    tags.file = path.join(dir, file)

    return tags
  }).filter(Boolean)
}
