'use strict'

const packageRepo = require('package-repo')
const path = require('path')
const fs = require('fs')
const cspawn = require('cross-spawn')
const downloadTarball = require('./download-tarball')
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
    const fromNpm = !!opts.fromNpm
    const dest = path.resolve('cache', name, version, fromNpm ? 'npm-t' : 'repo')

    fs.access(dest, function (err) {
      if (err) {
        if (fromNpm) {
          installFromNpm(name, version, dest, (err) => {
            callback(err, path.join(dest, 'package'))
          })
        } else {
          clone(repo.clone_url, dest, 'v' + version, (err) => {
            callback(err, dest)
          })
        }
      } else {
        callback(null, fromNpm ? path.join(dest, 'package') : dest)
      }
    })
  }

  function prepare (targetDir, testCommand, injectDir) {
    const entryPoint = require.resolve(targetDir)
    const backup = entryPoint + '.abm-backup'

    let originalCode

    try {
      originalCode = fs.readFileSync(backup, 'utf8')
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

    if (opts.dlopen) {
      const args = [require.resolve('./require-test')]
      const targets = [targetDir, injectDir]
      const cwd = targetDir

      if (opts.now) {
        args.push('--now')
      }

      const env = Object.assign({}, process.env, {
        DYLD_PRINT_APIS: '1',
        DYLD_PRINT_SEGMENTS: '1',
        DYLD_PRINT_BINDINGS: '1',
        DYLD_PRINT_INITIALIZERS: '1'
      })

      return spawn('node', args.concat(targets), { cwd, stdio, env }, callback)
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

function installFromNpm (name, version, dest, callback) {
  downloadTarball(name, version, dest, (err) => {
    if (err) return callback(err)

    // TODO: have downloadTarball() strip package/
    dest = path.join(dest, 'package')
    console.error('install', dest)

    spawn('npm', ['i', '--ignore-scripts'], { stdio, cwd: dest }, callback)
  })
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
