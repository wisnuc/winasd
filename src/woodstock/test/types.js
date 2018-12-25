const path = require('path')
const expect = require('chai').expect

const {
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
  STRUCT,
  ARRAY,
  VARIANT,
  DICT_ENTRY
} = require('lib/types')

const print = buf => {
  while (buf.length) {
    console.log(buf.slice(0, 16))
    buf = buf.slice(16)
  }
}

const ms1 = `
6c 02 01 01 0b 00 00 00 01 00 00 00 3d 00 00 00
06 01 73 00 06 00 00 00 3a 31 2e 31 39 36 00 00
05 01 75 00 01 00 00 00 08 01 67 00 01 73 00 00
07 01 73 00 14 00 00 00 6f 72 67 2e 66 72 65 65
64 65 73 6b 74 6f 70 2e 44 42 75 73 00 00 00 00
06 00 00 00 3a 31 2e 31 39 36 00 
`

const buf1 = Buffer.from(ms1.replace(/\W/g, ''), 'hex')

describe(path.basename(__filename), () => {
  it('constructing yyyyuua(yv)', done => {
    let s = new STRUCT('(yyyyuua(yv))')
    s.push(new BYTE('l'))
    s.push(new BYTE(2))
    s.push(new BYTE(1))
    s.push(new BYTE(1))
    s.push(new UINT32(0x0b))
    s.push(new UINT32(0x01))

    let kvArr = new ARRAY('a(yv)')
    let kv, key, val

    // DESTINATION 6
    kv = new STRUCT('(yv)')
    key = new BYTE(0x06)
    kv.push(key)
    val = new STRING(':1.196')
    kv.push(new VARIANT(val))
    kvArr.push(kv)

    // REPLY_SERIAL 
    kv = new STRUCT('(yv)')
    key = new BYTE(0x05)
    kv.push(key)
    val = new UINT32(0x01)
    kv.push(new VARIANT(val)) 
    kvArr.push(kv)

    // SIGNATURE 8
    kv = new STRUCT('(yv)')
    key = new BYTE(0x08)
    kv.push(key)
    val = new SIGNATURE('s')
    kv.push(new VARIANT(val))
    kvArr.push(kv)

    // SENDER 7
    kv = new STRUCT('(yv)')
    key = new BYTE(0x07) 
    kv.push(key)
    val = new VARIANT(new STRING('org.freedesktop.DBus'))
    kv.push(val)
    kvArr.push(kv)

    s.push(kvArr)

    let buf = Buffer.alloc(1024 * 16)
    let len = s.marshal(buf, 0, true) 

    // print(buf.slice(0, len))
    // print(buf1.slice(0, len))
    // console.log('compare', buf.slice(0, len).compare(buf1.slice(0, len)))
    expect(len).to.equal(77)
    expect(buf.slice(0, len).compare(buf1.slice(0, len))).to.equal(0)

    done()
  })

  it('unmarshal buf1', done => {
    let s = new STRUCT('(yyyyuua(yv))')
    let offset = s.unmarshal(buf1, 0, true)
    // console.log('offset', offset)
    // console.log(s)
    // console.log(s.elems.slice(-1)[0])
    // console.log(s.elems.slice(-1)[0].elems)
    
    // console.log(s.elems.slice(-1)[0])
    // console.log(JSON.stringify(s, null, '  '))
    done()
  })  
})

/**
a bad example
<Buffer 6c 01 00 01 34 00 00 00 02 00 00 00 84 00 00 00>
<Buffer 01 01 6f 00 0f 00 00 00 2f 6f 72 67 2f 62 6c 75>
<Buffer 65 7a 2f 68 63 69 30 00 02 01 73 00 1f 00 00 00>
<Buffer 6f 72 67 2e 62 6c 75 65 7a 2e 4c 45 41 64 76 65>
<Buffer 72 74 69 73 69 6e 67 4d 61 6e 61 67 65 72 31 00>
<Buffer 03 01 73 00 15 00 00 00 52 65 67 69 73 74 65 72>
<Buffer 41 64 76 65 72 74 69 73 65 6d 65 6e 74 00 00 00>
<Buffer 06 01 73 00 09 00 00 00 6f 72 67 2e 62 6c 75 65>
<Buffer 7a 00 00 00 00 00 00 00 08 01 67 00 06 6f 61 7b>
<Buffer 73 76 7d 00 00 00 00 00 27 00 00 00 2f 63 6f 6d>
<Buffer 2f 77 69 73 6e 75 63 2f 62 6c 75 65 74 6f 6f 74>
<Buffer 68 2f 6c 65 2f 61 64 76 65 72 74 69 73 65 6d 65>
<Buffer 6e 74 30 00 00 00 00 00 00 00 00 00>
*/


