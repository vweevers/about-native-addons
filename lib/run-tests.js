'use strict'

const pkg = require('package-repo')
// const rimraf = require('rimraf')
const path = require('path')
const fs = require('fs')
const cspawn = require('cross-spawn')
const stdio = ['ignore', 'inherit', 'inherit']

module.exports = function (dir, opts, callback) {
  const fp = path.resolve(dir, 'package.json')
  const repo = pkg(fp)
  const { name, version } = require(fp)
  const dest = path.resolve('cache', name, version, 'repo')

  fs.access(dest, function (err) {
    if (err) {
      clone(repo.clone_url, dest, 'v' + version, prepare)
    } else {
      prepare()
    }
  })

  function prepare (err) {
    if (err) {
      console.error(err)
      return callback() // Don't report as test failure

      // return rimraf(dest, { glob: false }, function () {
      //   callback()
      // })
    }

    const entryPoint = require.resolve(dest)
    const backup = entryPoint + '.abm-backup'

    try {
      var originalCode = fs.readFileSync(backup, 'utf8')
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(err)
        return callback()
      }
    }

    if (originalCode) {
      fs.writeFileSync(entryPoint, originalCode)
    } else {
      originalCode = fs.readFileSync(entryPoint, 'utf8')
    }

    if (opts.inject) {
      fs.writeFileSync(backup, originalCode)

      const lines = originalCode.split('\n')
      const i = /use strict/.test(lines[0]) ? 1 : 0

      lines.splice(i, 0,
        '// eslint-disable-next-line',
        `require(${JSON.stringify(opts.inject)})`
      )

      fs.writeFileSync(entryPoint, lines.join('\n'))
    }

    let testCommand = opts.testCommand || ['npm', 't']
    if (typeof testCommand === 'string') testCommand = testCommand.split(' ')

    const cmd = testCommand[0]
    const args = testCommand.slice(1)

    spawn(cmd, args, { stdio, cwd: dest }, function (err) {
      fs.writeFileSync(entryPoint, originalCode)
      fs.unlinkSync(backup)
      callback(err)
    })
  }
}

function clone (url, dest, tag, callback) {
  console.error('clone', url)
  spawn('git', ['clone', '--recurse-submodules', url, dest], { stdio }, function (err) {
    if (err) return callback(err)

    console.error('checkout', tag)
    spawn('git', ['checkout', tag], { stdio, cwd: dest }, function (err) {
      if (err) return callback(err)

      console.error('install')
      spawn('npm', ['i', '--build-from-source'], { stdio, cwd: dest }, callback)
    })
  })
}

function spawn (cmd, args, opts, callback) {
  const child = cspawn(cmd, args, opts)

  child.on('error', callback)
  child.on('close', function (code) {
    if (code) return callback(new Error('Exited with ' + code))
    callback()
  })
}
