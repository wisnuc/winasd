const path = require('path')
const expect = require('chai').expect

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

describe(path.basename(__filename), () => {
  it('byte 0', done => {
    let b = new BYTE(0)
    expect(b.eval()).to.equal(0)
    done()
  })

  it('byte 0 via TYPE(ay)', done => {
    let x = new TYPE('ay', [0,1,2]) 
    expect(x.eval()).to.deep.equal([0,1,2])
    done()
  })
})
