'use strict'

const packageRepo = require('package-repo')
const path = require('path')
const fs = require('fs')
const cspawn = require('cross-spawn')
const stdio = ['ignore', 'inherit', 'inherit']

module.exports = function (targetPkg, opts, callback) {
  maybeClone(targetPkg, (err, targetDir) => {
    if (err) return callback(err)

    if (opts.inject) {
      maybeClone(opts.inject, (err, injectDir) => {
        if (err) return callback(err)
        prepare(targetDir, opts.testCommand, injectDir)
      })
    } else {
      prepare(targetDir, opts.testCommand)
    }
  })

  function maybeClone (pkg, callback) {
    const repo = packageRepo(pkg)
    const { name, version } = pkg
    const dest = path.resolve('cache', name, version, 'repo')

    fs.access(dest, function (err) {
      if (err) {
        clone(repo.clone_url, dest, 'v' + version, (err) => {
          callback(err, dest)
        })
      } else {
        callback(null, dest)
      }
    })
  }

  function prepare (targetDir, testCommand, injectDir) {
    const entryPoint = require.resolve(targetDir)
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

    if (injectDir) {
      fs.writeFileSync(backup, originalCode)

      const lines = originalCode.split('\n')
      const i = /use strict/.test(lines[0]) ? 1 : 0

      lines.splice(i, 0,
        '// eslint-disable-next-line',
        `require(${JSON.stringify(injectDir)})`
      )

      fs.writeFileSync(entryPoint, lines.join('\n'))
    }

    if (typeof testCommand === 'string') {
      testCommand = testCommand.split(' ')
    }

    if (!testCommand || !testCommand.length) {
      if (targetPkg.name === 'sharp') {
        // "npm test" fails due to semistandard
        testCommand = ['npm', 'run', 'test-unit']
      } else if (targetPkg.name === 'keytar') {
        // "npm test" rebuilds every time
        testCommand = ['npx', 'mocha', '--require', 'babel-core/register', 'spec/']
      } else if (targetPkg.name === 'farmhash') {
        // "npm test" fails due to semistandard
        testCommand = ['node', 'test/unit']
      } else {
        testCommand = ['npm', 't']
      }
    }

    const cmd = testCommand[0]
    const args = testCommand.slice(1)

    spawn(cmd, args, { stdio, cwd: targetDir }, function (err) {
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
