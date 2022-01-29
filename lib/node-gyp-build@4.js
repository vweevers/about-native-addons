'use strict'

const path = require('path')
const readdirSync = require('./readdir-maybe')

// Compatible with node-gyp-build@4 (4.1.1)
exports.prebuilds = function (dir) {
  dir = path.resolve(dir, 'prebuilds')
  const results = []

  for (const dirname of readdirSync(dir)) {
    const [platform, arch] = dirname.split('-')
    const prebuilds = path.join(dir, dirname)

    for (const name of readdirSync(prebuilds)) {
      const prebuild = parseTags(name)
      if (!prebuild) continue

      prebuild.platform = platform
      prebuild.arch = arch
      prebuild.file = path.join(prebuilds, prebuild.file)

      results.push(prebuild)
    }
  }

  return results
}

function parseTags (file) {
  const arr = file.split('.')
  const extension = arr.pop()
  const tags = { file: file, specificity: 0 }

  if (extension !== 'node') return

  for (let i = 0; i < arr.length; i++) {
    const tag = arr[i]

    if (tag === 'node' || tag === 'electron' || tag === 'node-webkit') {
      tags.runtime = tag
    } else if (tag === 'napi') {
      tags.napi = true
    } else if (tag.slice(0, 3) === 'abi') {
      tags.abi = tag.slice(3)
    } else if (tag.slice(0, 2) === 'uv') {
      tags.uv = tag.slice(2)
    } else if (tag.slice(0, 4) === 'armv') {
      tags.armv = tag.slice(4)
    } else if (tag === 'glibc' || tag === 'musl') {
      tags.libc = tag
    } else {
      continue
    }

    tags.specificity++
  }

  return tags
}
