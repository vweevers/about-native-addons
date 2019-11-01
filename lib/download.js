'use strict'

const packageRepo = require('package-repo')
const path = require('path')
const ghreleases = require('ghreleases')
const tar = require('tar-fs')
const unzip = require('unzipper')
const request = require('request')
const gunzip = require('gunzip-maybe')
const fs = require('fs')
const readdirSync = require('./readdir-maybe')

// Adapted from mafintosh/prebuildify-ci
module.exports = function download (pkg, dest, callback) {
  const repo = packageRepo(pkg)
  const v = pkg.version

  if (readdirSync(dest).length > 0) {
    return process.nextTick(callback)
  }

  console.error('Downloading prebuilds from ' + repo.user + '/' + repo.repo + '@' + v)

  ghreleases.getByTag({}, repo.user, repo.repo, 'v' + v, { auth: '' }, function (err, doc) {
    if (err) return callback(err)

    const assets = doc.assets

    loop()

    function loop () {
      const next = assets.pop()
      if (!next) return callback()

      console.error('Downloading', next.name)

      const req = request(next.browser_download_url, {
        headers: { 'User-Agent': 'about-native-modules' }
      })

      if (/\.zip$/.test(next.name)) {
        const buf = []
        const subdest = path.join(dest, next.name.replace(/\.zip$/, ''))

        req.on('data', data => buf.push(data))
        req.on('end', function () {
          const uz = unzip.Extract({ path: subdest }).on('close', loop)
          uz.write(Buffer.concat(buf))
          uz.end()
        })
      } else if (/\.tar(\.gz)?$/.test(next.name)) {
        const subdest = path.join(dest, next.name.replace(/\.tar\.gz$/, ''))
        req.pipe(gunzip()).pipe(tar.extract(subdest)).on('finish', loop)
      } else {
        fs.mkdirSync(dest, { recursive: true })
        const file = path.join(dest, next.name)
        req.pipe(fs.createWriteStream(file)).on('finish', loop)
      }
    }
  })
}
