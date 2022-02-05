#!/usr/bin/env node
'use strict'

const split2 = require('split2')
const { Writable, pipeline } = require('readable-stream')
const table = require('markdown-table')
const approx = require('approximate-number')
const ghauth = require('ghauth')
const MultiStream = require('multistream')
const fs = require('fs')
const path = require('path')
const Project = require('../lib/project')
const commonDeps = require('../lib/common-deps')

const dataDir = process.argv[2]
const date = process.argv[3] || new Date().toISOString().split('T')[0]

if (!dataDir || isNaN(new Date(date))) {
  console.error('Usage: node bin/process-npm-data <dir> [date]')
  process.exit(1)
}

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

ghauth({
  configName: 'about-native-modules',
  note: 'For about-native-modules',
  userAgent: 'about-native-modules',
  noDeviceFlow: true
}, function (err, githubAuth) {
  if (err) throw err

  readData(dataDir).pipe(new Writable({
    objectMode: true,
    write (pkg, enc, next) {
      count++
      const project = new Project(pkg, { githubAuth })

      if (count % 1000 === 0) {
        console.error(
          'Progress: %d total, %d ignored, %d uncertain, %d unpopular, %d included',
          count, ignored, uncertain, unpopular, projects.length
        )
      }

      if (ignore.has(project.name)) {
        ignored++
        return next()
      } else if (!project.hydrateType()) {
        uncertain++
        return next()
      }

      project.hydrateDownloadCount((err) => {
        if (err) console.error(project.title, err.message)

        if (project.downloadCount < 200) {
          unpopular++
          return next()
        }

        project.hydratePrebuilds((err) => {
          if (err) console.error(project.title, err.message)

          projects.push(project)
          next()
        })
      })
    },
    final (callback) {
      console.error(
        'Done: %d total, %d ignored, %d uncertain, %d unpopular, %d included',
        count, ignored, uncertain, unpopular, projects.length
      )

      projects.sort((a, b) => b.downloadCount - a.downloadCount)

      const rows = projects.map(function (project) {
        const { name, version, type, prebuilds } = project

        return [
          npmLink(name),
          version,
          type === 'hand-rolled' ? type : type ? '`' + type + '`' : '',
          prebuilds.length,
          project.hasNapi() ? 'Yes' : '',
          project.language || '',
          approx(project.downloadCount),
          project.platforms().join('<br>')
        ]
      })

      rows.unshift([
        'Name',
        'Ver.',
        'Type',
        'Preb.',
        'NAPI',
        'Lang',
        'D/L',
        'Platforms'
      ])

      let markdown = '# Data\n\n'

      const stats = `${count} total, ${ignored} ignored, ${uncertain} uncertain, ${unpopular} unpopular, ${projects.length} included`

      markdown += [
        '_Also available as [`data.json`](data.json).',
        'Packages with less than 200 downloads in the past 30 days are excluded.',
        `Last updated: ${date} (${stats})._`
      ].join(' ')

      markdown += '\n\n'
      markdown += table(rows, { pad: false })

      fs.writeFileSync('data.md', markdown)

      const full = projects.map(function (project) {
        const { name, version, type, language, downloadCount } = project
        const napi = project.hasNapi()
        const platforms = project.platforms()
        const prebuilds = project.prebuilds.map(({ file, ...rest }) => rest)

        return {
          name,
          version,
          type,
          napi,
          prebuilds,
          language,
          downloadCount,
          platforms
        }
      })

      fs.writeFile('data.json', JSON.stringify(full, null, 2), callback)
    }
  }))
})

function readData (dir) {
  const streams = fs.readdirSync(dir).filter(isNDJSON).map(file => () => {
    file = path.join(dir, file)
    console.error('Reading: %s', file)
    return pipeline(fs.createReadStream(file), split2(JSON.parse))
  })

  return MultiStream.obj(streams)
}

function isNDJSON (file) {
  return file.endsWith('.ndjson')
}

function npmLink (name) {
  const url = `https://npmjs.com/package/${name}`
  const code = '`' + shortName(name) + '`'
  return `[${code}](${url})`
}

function shortName (name) {
  if (name.length > 20 && name[0] === '@') {
    return '../' + name.split('/')[1]
  }

  return name
}
