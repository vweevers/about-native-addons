'use strict'

module.exports = [
  'prebuild-install',
  'prebuild',
  'prebuildify',
  'node-gyp-build',
  'node-pre-gyp',
  'napi-macros',
  'nan',
  'node-gyp',
  'bindings',
  'node-addon-api',
  'neon-cli',

  // TODO: these are missing in the current data, rerun collect-npm-data.
  'cmake-js',
  'node-cmake',
  'prebuildify-ci',
  'node-gyp-install' // ?
]
