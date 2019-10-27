const fs = require('fs')
const path = require('path')

// Compatible with node-gyp-build@3 (3.9.0)
exports.prebuilds = function (dir) {
  const results = []
  add(results, path.resolve(dir, 'native', 'prebuilds'))
  add(results, path.resolve(dir, 'prebuilds'))
  return results
}

function add (results, dir) {
  for (const dirname of readdirSync(dir)) {
    const a = dirname.split('-')
    const tags = {}

    // $platform[$libc]-$arch[-v$armv]
    if (a.length === 3) {
      tags.platform = a[0]
      tags.arch = a[1]
      tags.armv = a[2].slice(1)
    } else if (a.length === 2) {
      tags.platform = a[0]
      tags.arch = a[1]
    } else {
      throw new Error('Unsupported format: ' + dirname)
    }

    if (tags.platform.endsWith('glibc')) {
      tags.platform = tags.platform.slice(0, -'glibc'.length)
      tags.libc = 'glibc'
    } else if (tags.platform.endsWith('musl')) {
      tags.platform = tags.platform.slice(0, -'musl'.length)
      tags.libc = 'musl'
    }

    if (tags.arch === 'arm64') tags.arch === 'armv8'
    if (tags.arch === 'armv8') tags.armv = '8'
    if (tags.arch === 'armv7') tags.armv = '7'
    if (tags.arch === 'armv6') tags.armv = '6'

    const prebuilds = path.join(dir, dirname)

    for (const name of readdirSync(prebuilds)) {
      const prebuild = Object.assign({}, tags)

      if (name.endsWith('-napi.node')) { // $runtime-napi
        prebuild.runtime = name.slice(0, -'-napi.node'.length)
        prebuild.napi = true
      } else if (name.endsWith('.node')) { // $runtime-$abi
        const a = name.split('-')
        prebuild.abi = a.pop().slice(0, -'.node'.length)
        prebuild.runtime = a.join('-')
      } else {
        continue
      }

      prebuild.file = path.join(prebuilds, name)
      results.push(prebuild)
    }
  }

  return results
}

function readdirSync (dir) {
  try {
    return fs.readdirSync(dir)
  } catch (err) {
    return []
  }
}
