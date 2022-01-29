#!/usr/bin/env node
'use strict'

const get = require('simple-get')
const packageStream = require('package-stream')
const commonDeps = require('../lib/common-deps')

get.concat({ url: 'https://replicate.npmjs.com/', json: true }, function (err, res, data) {
  if (err) throw err

  const total = data.doc_count

  if (!Number.isInteger(total)) {
    console.error(data)
    console.error('Expected a doc_count number')
    process.exit(1)
  }

  const registry = packageStream({
    // Update sequence to start from. If the script fails halfway, use the last
    // logged seq to continue where it left off.
    since: 0
  })

  let count = 0
  let matches = 0

  registry
    .on('package', ondata)
    .on('up-to-date', done)

  function ondata (pkg, seq) {
    count++

    const progress = ((count / total) * 100).toFixed(3)
    console.error(`${count} (${progress}%) m:${matches} seq:${seq}`)

    try {
      if (maybeNative(pkg)) {
        console.log(JSON.stringify(pkg))
        matches++
      }
    } catch (err) {
      console.error(err)
    }
  }

  function done () {
    console.error('done')
    process.exit()
  }
})

function maybeNative (pkg) {
  if (pkg.gypfile) {
    return true
  }

  if (pkg.scripts) {
    if (/node-gyp (re)?build/.test(pkg.scripts.install)) {
      return true
    } else if (/node-gyp (re)?build/.test(pkg.scripts.preinstall)) {
      return true
    }
  }

  for (const dep of commonDeps) {
    if (dependsOn(pkg, dep)) {
      return true
    }
  }

  if (pkg.name === 'fsevents') {
    return true
  }

  return false
}

function dependsOn (pkg, dep) {
  if (pkg.dependencies && pkg.dependencies[dep]) return true
  if (pkg.devDependencies && pkg.devDependencies[dep]) return true
  if (pkg.peerDependencies && pkg.peerDependencies[dep]) return true
  if (pkg.optionalDependencies && pkg.optionalDependencies[dep]) return true

  return false
}
