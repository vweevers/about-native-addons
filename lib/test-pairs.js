'use strict'

module.exports = async function testPairs (projects, test) {
  const header = ['', 'x']
  const rows = [header]

  // Generate a table like:
  //     x   0   1
  // a   0   -   OK
  // b   1   OK  -

  let i = 0

  for (const a of projects) {
    const row = [a.title, i]

    header.push(i++)
    rows.push(row)

    for (const b of projects) {
      if (a === b) {
        row.push('-')
        continue
      }

      try {
        await test(a, b)
        row.push('OK')
      } catch (err) {
        console.error(err)
        row.push('ERR')
      }
    }
  }

  return rows
}
