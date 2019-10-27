'use strict'

const ids = process.argv.slice(2)
const tmp = require('os').tmpdir()
const path = require('path')
const fs = require('fs')
const Module = require('module')
const originalRequire = Module.prototype.require
const cache = {}

let seen = null

Module.prototype.require = function (id) {
  const resolved = Module._resolveFilename(id, this)

  if (resolved.endsWith('.node')) {
    if (!cache[resolved]) {
      if (seen) {
        throw new Error('Loaded additional addon: ' + id)
      }

      seen = resolved
      const wrapped = path.join(tmp, `require-test-${Date.now()}.js`)

      fs.writeFileSync(wrapped, `
        const constants = require('os').constants.dlopen
        process.dlopen(module, ${JSON.stringify(resolved)}) // , constants.RTLD_GLOBAL | constants.RTLD_NOW)
      `)

      cache[resolved] = originalRequire.call(this, wrapped)
    }

    return cache[resolved]
  }

  return originalRequire.call(this, id)
}

for (const id of ids) {
  seen = null
  require(id)

  if (!seen) {
    throw new Error('Could not hook into require(): ' + id)
  }

  console.log(seen)
}
