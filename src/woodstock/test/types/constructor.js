const path = require('path')
const expect = require('chai').expect

const {
  LITTLE,
  BIG,
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

describe(path.basename(__filename) + 'construct by signature', () => {
  it ('new BYTE', done => {
    let x = new BYTE() 
    console.log(x)
    done()
  }) 

  it('new ARRAY', done => {
    let { sig, esig, elems } = new ARRAY('ai')
    expect(sig).to.equal('ai')
    expect(esig).to.equal('i')
    expect(elems).to.deep.equal([])
    done()
  }) 

  it('new STRUCT', done => {
    let { sig, esigs, elems } = new STRUCT('(aii)')
    expect(sig).to.equal('(aii)')
    expect(esigs).to.deep.equal(['ai', 'i'])
    expect(elems).to.deep.equal([])
    done()
  })

  it('new DICT_ENTRY', done => {
    let { sig, esigs, elems } = new DICT_ENTRY('{sv}')
    expect(sig).to.equal('{sv}')
    expect(esigs).to.deep.equal(['s', 'v'])
    expect(elems).to.deep.equal([])
    done()
  }) 

  it('new VARIANT', done => {
    let { sig, esigs, elems } = new VARIANT()
    expect(sig).to.equal('v')
    expect(esigs).to.deep.equal([])
    expect(elems).to.deep.equal([])
    done()
  })

})
