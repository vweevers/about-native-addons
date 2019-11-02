#!/usr/bin/env node
'use strict'

const table = require('markdown-table')
const testPairs = require('../lib/test-pairs')
const promisify = require('util').promisify
const runTests = promisify(require('../lib/run-tests'))
const createProject = promisify(require('../lib/project').from)

;(async function () {
  const projects = await Promise.all(process.argv.slice(2).map(spec => {
    return createProject(spec)
  }))

  if (projects.length < 2) {
    console.error('usage: test-side-by-side <a> <b>')
    process.exit(1)
  }

  const testMatrix = await testPairs(projects, async function (a, b) {
    console.error('Test %s with injected %s', a.title, b.title)
    return runTests(a.pkg, { inject: b.pkg })
  })

  console.log(table(testMatrix))
})()
