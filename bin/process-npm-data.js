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
const commonDeps = require('../lib/data/common-deps')
const ignoreDeps = require('../lib/data/ignore')

const dataDir = process.argv[2]
const date = process.argv[3] || new Date().toISOString().split('T')[0]

if (!dataDir || isNaN(new Date(date))) {
  console.error('Usage: node bin/process-npm-data <dir> [date]')
  process.exit(1)
}

const ignore = new Set(ignoreDeps.concat(commonDeps))

let count = 0
let ignored = 0
let uncertain = 0
let unpopular = 0

const projects = []
const minimumDownloads = 150

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
          'Progress: %d candidates, %d ignored, %d uncertain, %d unpopular, %d included',
          count, ignored, uncertain, unpopular, projects.length
        )
      }

      if (ignore.has(project.name) || pkg.deprecated) {
        ignored++
        return next()
      }

      project.hydrateDownloadCount((err) => {
        if (err) console.error(project.title, err.message)

        if (project.downloadCount < minimumDownloads) {
          unpopular++
          return next()
        }

        if (!project.hydrateType()) {
          uncertain++
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
        'Done: %d candidates, %d ignored, %d uncertain, %d unpopular, %d included',
        count, ignored, uncertain, unpopular, projects.length
      )

      projects.sort((a, b) => b.downloadCount - a.downloadCount)

      const typeCounts = {}
      const typeDownloads = {}
      let nodeApiCount = 0

      const rows = projects.map(function (project) {
        const { name, type, prebuilds } = project
        const hasNodeAPI = project.hasNodeAPI()
        const t = type.startsWith('node-gyp-build@') ? 'node-gyp-build' : type

        typeCounts[t] = (typeCounts[t] || 0) + 1
        typeDownloads[t] = (typeDownloads[t] || 0) + project.downloadCount

        if (hasNodeAPI) nodeApiCount++

        return [
          npmLink(name),
          type === 'custom' ? type : type ? '`' + type + '`' : '',
          prebuilds.length,
          hasNodeAPI ? 'Yes' : '',
          approx(project.downloadCount),
          project.platforms().join('<br>')
        ]
      })

      rows.unshift([
        'Package',
        'Type',
        'Preb.',
        'Node-API',
        'D/L',
        'Platforms'
      ])

      let markdown = '# Data\n\n'

      const stats = `${count} candidates, ${ignored} ignored, ${uncertain} uncertain, ${unpopular} unpopular, ${projects.length} included`
      const percent = (count) => ((count / projects.length) * 100).toFixed(1) + '%'

      markdown += [
        '_Also available as [`data.json`](data.json).',
        `Packages with less than ${minimumDownloads} downloads in the past 30 days (the D/L column) are excluded.`,
        `Last updated: ${date} (${stats})._`
      ].join(' ')

      markdown += '\n\n'
      markdown += `Of these ${projects.length} packages, at least ${nodeApiCount} (${percent(nodeApiCount)}) use Node-API. As for prebuilt binaries and install scripts:\n\n`

      for (const type of Object.keys(typeCounts).sort((a, b) => typeCounts[b] - typeCounts[a])) {
        const count = typeCounts[type]
        const formatted = type === 'custom' ? 'a custom install script' : type === 'node-gyp' ? npmLink(type) + ' implicitly or explicitly, without prebuilt binaries' : npmLink(type)
        const dl = approx(typeDownloads[type])

        markdown += `- ${count} (${percent(count)}) use ${formatted} (combined downloads: ${dl})\n`
      }

      markdown += '\n' + table(rows, { pad: false })

      fs.writeFileSync('data.md', markdown)

      const full = projects.map(function (project) {
        const { name, version, type, language, downloadCount } = project
        const nodeAPI = project.hasNodeAPI()
        const platforms = project.platforms()
        const prebuilds = project.prebuilds.map(({ file, ...rest }) => rest)

        return {
          name,
          version,
          type,
          nodeAPI,
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
    return '*/' + name.split('/')[1]
  }

  return name
}
