'use strict'

const ids = process.argv.slice(2)
const tmp = require('os').tmpdir()
const path = require('path')
const fs = require('fs')
const Module = require('module')
const originalRequire = Module.prototype.require
const cache = {}

let flags = null
let seq = 0

if (ids[0] === '--now') {
  ids.shift()
  flags = 'RTLD_NOW'
} else {
  flags = 'RTLD_LAZY'
}

Module.prototype.require = function (id) {
  const resolved = Module._resolveFilename(id, this)

  if (resolved.endsWith('.node')) {
    if (!cache[resolved]) {
      const wrapped = path.join(tmp, `require-test-${Date.now()}-${seq++}.js`)

      fs.writeFileSync(wrapped, `
        const { RTLD_NOW, RTLD_LAZY, RTLD_GLOBAL, RTLD_LOCAL } = require('os').constants.dlopen
        process.dlopen(module, ${JSON.stringify(resolved)}, ${flags})
      `)

      console.error('dlopen (%s)', flags, resolved)
      cache[resolved] = originalRequire.call(this, wrapped)
    }

    return cache[resolved]
  }

  return originalRequire.call(this, id)
}

for (const id of ids) {
  require(id)
}
