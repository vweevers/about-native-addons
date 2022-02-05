#!/usr/bin/env node
'use strict'

const split2 = require('split2')
const { Writable, pipeline } = require('readable-stream')
const MultiStream = require('multistream')
const fs = require('fs')
const path = require('path')

const dataDir = process.argv[2]

if (!dataDir) {
  console.error('Usage: node bin/dedupe-npm-data <dir>')
  process.exit(1)
}

const packages = new Map()
let rawCount = 0

// Because a package may appear more than once, we first need to read all into memory.
readData(dataDir).pipe(new Writable({
  objectMode: true,
  write (pkg, enc, next) {
    rawCount++

    // Remove data we don't need
    pkg.readme = undefined

    // Newer packument overrides old
    packages.set(pkg.name, pkg)

    if (rawCount % 1000 === 0) {
      console.error('Reading: %d raw, %d deduped', rawCount, packages.size)
    }

    next()
  },
  final (callback) {
    console.error('Writing: %d raw, %d deduped', rawCount, packages.size)

    for (const pkg of packages.values()) {
      console.log(JSON.stringify(pkg))
    }

    console.error('Done')
    callback()
  }
}))

function readData (dir) {
  // Include files from multiple collect runs. E.g. one can do:
  // node bin/collect-npm-data 0 > cache/raw/raw-01.ndjson
  // node bin/collect-npm-data 8129577 > cache/raw/raw-02.ndjson
  // node bin/dedupe-npm-data cache/raw > cache/deduped/deduped.ndjson
  const streams = fs.readdirSync(dir).filter(isNDJSON).sort().map(file => () => {
    file = path.join(dir, file)
    console.error('Reading: %s', file)
    return pipeline(fs.createReadStream(file), split2(JSON.parse))
  })

  return MultiStream.obj(streams)
}

function isNDJSON (file) {
  return file.endsWith('.ndjson')
}
