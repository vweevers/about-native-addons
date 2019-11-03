#!/usr/bin/env node
'use strict'

console.error('Not supported')
process.exit(1)

const table = require('markdown-table')
const semver = require('semver')
const resolve = require('resolve')
const cp = require('child_process')
const promisify = require('util').promisify
const runTests = promisify(require('../lib/run-tests'))
const testPairs = require('../lib/test-pairs')
const analyze = require('../old')

;(async function () {
  const subjects = [
    [['leveldown.5.0.2', 'leveldown.5.4.0', 'leveldown.5.4.1'], {
      ignoreSymbol (sym) {
        return /leveldb|snappy/.test(sym)
      }
    }],
    ['rocksdb', {
      ignoreSymbol (sym) {
        return /rocksdb/.test(sym)
      }
    }],
    // 'bignum'
    ['bufferutil'],
    // ['couchbase'], // Tests require java
    // ['event-loop-delay'],
    ['farmhash'],
    ['fd-lock'],
    ['keytar'],
    ['microtime'],
    ['sharp'],
    ['sodium-native'],
    ['tree-sitter'],
    ['utf-8-validate'],
    ['utp-native'],
    // ['zeromq'], // Tests fail on their own
    // ['zeromq-ng'],
    // ['fuse-bindings'],
    ['lzo-decompress']
    // ['rabin-native'],
    // ['node-levenshtein']
  ]

  const promises = []
  const add = (id, opts) => { promises.push(analyze(id, opts)) }

  for (const [id, opts] of subjects) {
    if (Array.isArray(id)) {
      id.forEach(id => add(id, opts))
    } else {
      add(id, opts)
    }
  }

  const projects = await Promise.all(promises)
  const macPrebuilds = []

  for (const project of projects) {
    for (const prebuild of project.prebuilds.files) {
      if (prebuild.platform === 'darwin' && prebuild.globalSymbols.length) {
        macPrebuilds.push({ prebuild, project })
      }
    }
  }

  const visited = new Set()

  // Find conflicting symbol names (approx.)
  for (const a of macPrebuilds) {
    for (const b of macPrebuilds) {
      if (a.prebuild === b.prebuild) {
        continue
      } else if (a.project.name === b.project.name) {
        if (a.project.version === b.project.version) continue
        if (differentTarget(a.project, b.project)) continue
      }

      const pair = [a.project.title, b.project.title].sort().join(',')

      if (visited.has(pair)) continue
      else visited.add(pair)

      const conflicts = a.prebuild.globalSymbols
        .filter(s => b.prebuild.globalSymbols.indexOf(s) >= 0)
        .filter(s => {
          if (/^__ZN3Nan/.test(s)) {
            return depversion('nan', a.project.dir) !==
              depversion('nan', b.project.dir)
          } else if (/napi_macros/.test(s)) {
            return depversion('napi-macros', a.project.dir) !==
              depversion('napi-macros', b.project.dir)
          }

          return true
        })

      if (conflicts.length) {
        // console.error('Conflict between %s and %s', a.project.title, b.project.title)
        // console.error(conflicts)
        a.project.conflicts = b.project.conflicts = 'y'
      }
    }
  }

  projects.sort(cmpNameVersion)

  const rows = projects.map(function (project) {
    const { name, version, loadable, conflicts } = project
    const { type, files } = project.prebuilds

    let sym = 0
    let hasNapi = false

    for (const prebuild of files) {
      if (prebuild.platform === 'darwin') {
        sym = Math.max(prebuild.globalSymbols.length, sym)
      }

      if (prebuild.napi) hasNapi = true
    }

    return [
      name,
      version,
      type,
      files.length,
      hasNapi ? 'Yes' : '',
      sym,
      loadable ? 'OK' : 'ERR',
      conflicts ? 'Yes' : ''
    ]
  })

  rows.unshift([
    'Name',
    'Version',
    'Type',
    'Prebuilds',
    'N-API',
    'Syms',
    'Load',
    'Conflict'
  ])

  console.log('## Data\n')

  console.log(table(rows, {
    align: ['l', 'l', 'l', 'r', 'l', 'r', 'r', 'l']
  }))

  console.log('\n## Load test\n')

  const loadMatrix = await testPairs(projects, async function (a, b) {
    console.error('Load', a.title, b.title)
    cp.execFileSync('node', ['lib/require-test', a.id, b.id])
  })

  console.log(table(loadMatrix))

  console.log('\n## Package tests\n')

  const testMatrix = await testPairs(projects, async function (a, b) {
    console.error('Test %s with injected %s', a.title, b.title)
    return runTests(a.pkg, { inject: b.pkg })
  })

  console.log(table(testMatrix))
})()

function depversion (dep, basedir) {
  return require(resolve.sync(`${dep}/package.json`, { basedir })).version
}

function differentTarget (a, b) {
  const tags = [
    'abi', 'napi', 'napiVersion', 'runtime',
    'armv', 'arch', 'libc', 'uv', 'armv'
  ]

  for (const tag of tags) {
    if (a[tag] !== b[tag]) return true
  }

  return false
}

function cmpNameVersion (a, b) {
  if (a.name === b.name) return semver.rcompare(a.version, b.version)
  return a.name.localeCompare(b.name)
}
