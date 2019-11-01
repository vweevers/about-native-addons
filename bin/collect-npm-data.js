#!/usr/bin/env node
'use strict'

// Note to self: last seq was 3568977

const commonDeps = require('../lib/common-deps')
const registry = require('package-stream')({
  // Update sequence to start from. If the script fails halfway, use the last
  // logged seq to continue where it left off.
  since: 0
})

// From https://replicate.npmjs.com/ (2019-11-01)
const docCount = 1117787

let count = 0
let matches = 0

registry
  .on('package', ondata)
  .on('up-to-date', done)

function ondata (pkg, seq) {
  count++

  const progress = ((count / docCount) * 100).toFixed(3)
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

function maybeNative (pkg) {
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
