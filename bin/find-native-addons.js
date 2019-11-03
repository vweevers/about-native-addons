#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const cwd = path.resolve(process.argv[2] || '.')
const names = new Set(require('../data.json').map(p => p.name))

walk(path.join(cwd, 'node_modules'))

function walk (dir) {
  fs.readdir(dir, (err, files) => {
    if (err) return

    for (const file of files) {
      if (names.has(file)) {
        fs.readFile(path.join(dir, file, 'package.json'), (err, json) => {
          if (err) return console.log(file)

          const version = JSON.parse(json).version
          console.log('%s@%s', file, version)
        })
      }

      walk(path.join(dir, file, 'node_modules'))
    }
  })
}
