const path = require('path')
const expect = require('chai').expect

const debug = require('debug')('hello')

const {
  LITTLE,
  BIG,
  TYPE,
  BYTE,
  BOOLEAN,
  INT16,
  UINT16,
  INT32,
  UINT32,
  INT64,
  UINT64,
  DOUBLE,
  UNIX_FD,
  STRING,
  OBJECT_PATH,
  SIGNATURE,
  ARRAY,
  STRUCT,
  DICT_ENTRY,
  VARIANT
} = require('lib/dbus-types')

const sig01 = 'sa{sv}as'
const string01 = `
12 00 00 00 6f 72 67 2e 62 6c 75 65 7a 2e 41 64
61 70 74 65 72 31 00 00 14 00 00 00 00 00 00 00
05 00 00 00 43 6c 61 73 73 00 01 75 00 00 00 00
0c 01 1c 00 00 00 00 00`

const buf01 = Buffer.from(string01.replace(/\W/g, ''), 'hex')

console.log(process.env.DEBUG)

debug('world')

console.log(debug)


describe(path.basename(__filename), () => {
  it('hello', done => {
    let s = new STRUCT('(' + sig01 +')')
    s.unmarshal(buf01, 0, true)
    done()
  })
})


