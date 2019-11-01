#!/usr/bin/env node
'use strict'

const split2 = require('split2')
const { Writable } = require('readable-stream')
const table = require('markdown-table')
const Project = require('../lib/project')
const commonDeps = require('../lib/common-deps')

const ignore = new Set([
  'no-one-left-behind',
  'a-native-module',
  'a-native-module-without-prebuild',
  'require-rebuild',
  '@s524797336/require-rebuild',
  '@eugeneware/rocksdb',
  'ssss-nodewrap',
  'wc-starterkit',
  'sabers',
  'ocpp-js',
  'rockmsvc',
  'wedmaster',
  'customer-service',
  '@paulcbetts/electron-rxdb',
  'iohook-prebuild-test',
  'pivot-authentication-service',
  'sdk-billtobill',
  'sdkn-billtobill',
  'sdk-snr',
  'rue-mist'
].concat(commonDeps))

let count = 0
let ignored = 0
let uncertain = 0
let unpopular = 0

const projects = []

process.stdin
  .pipe(split2(JSON.parse))
  .pipe(new Writable({
    objectMode: true,
    write (pkg, enc, next) {
      count++
      const project = new Project(pkg)

      if (ignore.has(project.name)) {
        ignored++
        return next()
      } else if (!project.hydrateType()) {
        uncertain++
        return next()
      }

      project.hydrateDownloadCount(async (err) => {
        if (err) return next(err)

        if (project.downloadCount < 1000) {
          unpopular++
          return next()
        }

        projects.push(project)

        try {
          await project.hydratePrebuilds()
        } catch (err) {
          console.error(project.title, err.message)
        }

        next()
      })
    },
    final (callback) {
      console.error(
        'done (%d raw, %d ignored, %d uncertain, %d unpopular, %d included)',
        count, ignored, uncertain, unpopular, projects.length
      )

      projects.sort((a, b) => b.downloadCount - a.downloadCount)

      const rows = projects.map(function (project) {
        const { name, version, type, prebuilds } = project

        return [
          npmLink(name),
          version,
          type ? '`' + type + '`' : '',
          prebuilds.length,
          project.hasNapi() ? 'Yes' : '',
          project.language || '',
          project.downloadCount
        ]
      })

      rows.unshift([
        'Name',
        'Version',
        'Type',
        'Prebuilds',
        'N-API',
        'Lang',
        'D/L'
      ])

      console.log('## Data\n')
      console.log(table(rows, { pad: false }))

      callback()
    }
  }))

function npmLink (name) {
  const url = `https://npmjs.com/package/${name}`
  const code = '`' + name + '`'

  return `[${code}](${url})`
}
