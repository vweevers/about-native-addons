'use strict'

// Manual overrides for things we can't detect
module.exports = new Map([
  ['n64', 'node-gyp'],
  ['fcopy-pre-bundled', 'node-gyp'],
  ['mmap-io', 'node-gyp'],
  ['bigint-buffer', 'node-gyp'],
  ['node-termios', 'node-gyp'],
  ['ursa-optional', 'node-gyp'],
  ['java-with-jre', 'node-gyp'],
  ['node-pty', 'node-gyp'],
  ['@tabby-gang/node-pty', 'node-gyp'],
  ['@theia/node-pty', 'node-gyp'],
  ['@terminus-term/node-pty', 'node-gyp'],
  ['profoundjs-node-pty', 'node-gyp'],
  ['@contrast/heapdump', 'node-gyp'],
  ['ibm_db', 'node-gyp'],
  ['deasync', 'node-gyp'],
  ['ssh2', 'node-gyp'],
  ['cdt-gdb-adapter', 'node-gyp'],
  ['vscode-fsevents', 'node-gyp'],

  ['nodegit', 'custom'],
  ['zookeeper', 'custom'],
  ['@nodegui/nodegui', 'custom'],
  ['pc-ble-driver-js', 'custom'],
  ['@huddly/device-api-usb', 'custom'],
  ['@axosoft/nodegit', 'custom'],
  ['python.node', 'custom'],
  ['edge', 'custom'],
  ['edge-js', 'custom'],
  ['electron-edge-js', 'custom'],
  ['sodium', 'custom'],
  ['stackimpact', 'custom'],
  ['iohook', 'custom'],
  ['node-sspi', 'custom'],
  ['iconv-corefoundation', 'custom'],
  ['blake3', 'custom'],
  ['@newrelic/native-metrics', 'custom'],
  ['@appsignal/nodejs-ext', 'custom'],
  ['@appsignal/nodejs', 'custom'],
  ['@datadog/native-appsec', 'custom'],
  ['@instana/autoprofile', 'custom'],
  ['@contrast/distringuish-prebuilt', 'custom'],
  ['aws-crt', 'custom'], // uses cmake-js programmatically
  ['raknet-native', 'custom'], // uses cmake-js programmatically
  ['test-gcanvas-node', 'custom'], // uses cmake-js (at quick glance)
  ['@agoric/cosmos', 'custom'], // prebuilts included in package tarball
  ['nvk', 'custom'], // prebuilts included in package tarball
  ['re2', 'custom'],
  ['@chainsafe/blst', 'custom'],
  ['@cubbit/enigma', 'custom'],
  ['onnxruntime-node', 'custom'], // prebuilts included in package tarball
  ['@lastos/localsdk', 'custom'], // prebuilts included in package tarball
  ['ntsuspend', 'custom'],
  ['@altronix/linq', 'custom'],
  ['@eosrio/node-abieos', 'custom'],
  ['catboost', 'custom'],
  ['get-cwd-of-process', 'custom']
])
