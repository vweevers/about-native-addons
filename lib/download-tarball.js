'use strict'

const tarballUrl = require('get-npm-tarball-url').default
const tar = require('tar-fs')
const request = require('request')
const gunzip = require('gunzip-maybe')
const readdirSync = require('./readdir-maybe')

module.exports = function (name, version, dest, callback) {
  if (readdirSync(dest).length > 0) {
    return process.nextTick(callback)
  }

  const url = tarballUrl(name, version)
  const headers = { 'User-Agent': 'about-native-modules' }

  console.error('Downloading', url)

  request(url, { headers })
    .pipe(gunzip())
    .pipe(tar.extract(dest))
    .on('finish', callback)
}
