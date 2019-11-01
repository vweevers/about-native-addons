'use strict'

const fs = require('fs')

module.exports = function (dir) {
  try {
    return fs.readdirSync(dir)
  } catch (err) {
    return []
  }
}
