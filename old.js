'use strict'

const globalSymbols = require('global-symbols')
const semver = require('semver')
const promisify = require('util').promisify
const pe = promisify(require('pe-coff'))
const download = promisify(require('./lib/download'))
const ngb4 = require('./lib/node-gyp-build@4')
const ngb3 = require('./lib/node-gyp-build@3')
const pi4 = require('./lib/prebuild-install@4')
const path = require('path')
const cp = require('child_process')

async function analyze (id, options) {
  options = options || {}

  const pkgPath = require.resolve(`${id}/package.json`)
  const pkg = require(pkgPath)
  const { name, version } = pkg
  const dir = path.dirname(pkgPath)
  const title = name + '@' + version
  const project = { name, version, id, dir, pkg, title, options }

  project.prebuilds = await getPrebuilds(project)

  for (const prebuild of project.prebuilds.files) {
    prebuild.globalSymbols = getGlobalSymbols(prebuild, options.ignoreSymbol)

    if (prebuild.platform === 'win32') {
      prebuild.pe = await pe(prebuild.file)

      const mt = prebuild.pe.machineType
      const expectedArch = mt === 'amd64' ? 'x64' : 'ia32'

      if (prebuild.arch !== expectedArch) {
        throw new Error(`Expected ${expectedArch} (${mt}), got ${prebuild.arch} for ${prebuild.file}`)
      }
    }
  }

  try {
    const out = cp.execFileSync('node', ['lib/require-test', id])
    project.resolvedBuild = out.toString().trim()
    project.loadable = true
  } catch (err) {
    console.error(err.message)
    project.loadable = false
  }

  return project
}

async function getPrebuilds (project) {
  if (hasDependency(project.pkg, 'node-gyp-build', '>=4')) {
    return { type: 'node-gyp-build@4', files: ngb4.prebuilds(project.dir) }
  } else if (hasDependency(project.pkg, 'node-gyp-build', '>=3')) {
    return { type: 'node-gyp-build@3', files: ngb3.prebuilds(project.dir) }
  } else if (hasDependency(project.pkg, 'prebuild-install', '>=4')) {
    const dest = path.resolve('cache', project.name, project.version, 'prebuilds')
    await download(project.pkg, dest)
    const files = pi4.prebuilds(project.name, project.version, dest)
    return { type: 'prebuild-install', files }
  } else {
    throw new Error('Not supported: ' + project.name)
  }
}

function getGlobalSymbols (prebuild, ignoreSymbol) {
  if (prebuild.platform === 'win32') {
    return []
  }

  const syms = globalSymbols(prebuild.file)

  if (ignoreSymbol) {
    return syms.filter(sym => !ignoreSymbol(sym))
  } else {
    return syms
  }
}

function hasDependency (pkg, id, range) {
  if (!pkg.dependencies || !pkg.dependencies[id]) return false
  if (!range) return true
  return semver.satisfies(semver.minVersion(pkg.dependencies[id]), range)
}

module.exports = analyze
