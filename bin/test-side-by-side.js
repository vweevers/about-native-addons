#!/usr/bin/env node
'use strict'

const table = require('markdown-table')
const testPairs = require('../lib/test-pairs')
const promisify = require('util').promisify
const runTests = promisify(require('../lib/run-tests'))
const createProject = promisify(require('../lib/project').from)
const argv = require('minimist')(process.argv.slice(2), {
  boolean: ['npm', 'dlopen', 'now']
})

;(async function () {
  const projects = await Promise.all(argv._.map(spec => {
    return createProject(spec)
  }))

  if (projects.length < 2) {
    console.error('usage: test-side-by-side <a> <b> [c]')
    process.exit(1)
  }

  const testMatrix = await testPairs(projects, async function (a, b) {
    if (argv.dlopen) {
      console.error('Test dlopen %s and %s', a.title, b.title)
    } else {
      console.error('Test %s with injected %s', a.title, b.title)
    }

    return runTests(a.pkg, {
      inject: b.pkg,
      fromNpm: argv.npm,
      dlopen: argv.dlopen,
      now: argv.now
    })
  })

  console.log(table(testMatrix))
})()
