'use strict'

var fs = require('fs')
var pkg = require('package-repo')
var path = require('path')
var ghreleases = require('ghreleases')
var tar = require('tar-fs')
var unzip = require('unzipper')
var request = require('request')
var gunzip = require('gunzip-maybe')

// Adapted from mafintosh/prebuildify-ci
module.exports = function download (dir, dest, callback) {
  var file = path.resolve(dir, 'package.json')
  var repo = pkg(file)
  var v = require(file).version

  if (readdirSync(dest).length > 0) {
    return process.nextTick(callback)
  }

  console.error('Downloading prebuilds from ' + repo.user + '/' + repo.repo + '@' + v)

  ghreleases.getByTag({}, repo.user, repo.repo, 'v' + v, {auth: ''}, function (err, doc) {
    if (err) return callback(err)

    var assets = doc.assets

    loop()

    function loop () {
      var next = assets.pop()
      if (!next) return callback()

      console.error('Downloading', next.name)

      var req = request(next.browser_download_url, {
        headers: {'User-Agent': 'prebuildify-ci'}
      })

      if (/\.zip$/.test(next.name)) {
        const buf = []
        const subdest = path.join(dest, next.name.replace(/\.zip$/, ''))

        req.on('data', data => buf.push(data))
        req.on('end', function () {
          var uz = unzip.Extract({ path: subdest }).on('close', loop)
          uz.write(Buffer.concat(buf))
          uz.end()
        })
      } else {
        const subdest = path.join(dest, next.name.replace(/\.tar\.gz$/, ''))
        req.pipe(gunzip()).pipe(tar.extract(subdest)).on('finish', loop)
      }
    }
  })
}

function readdirSync (dir) {
  try {
    return fs.readdirSync(dir)
  } catch (err) {
    return []
  }
}
