const path = require('path') 
const chai = require('chai')
const expect = chai.expect

const { explode } = require('lib/sig')

describe(path.basename(__filename), () => {
  it('oa{sv}', done => {
    expect(explode('oa{sv}')).to.deep.equal(['o', 'a{sv}'])
    done()
  })

  it('yyyyuua(yv)', done => {
    expect(explode('yyyyuua(yv)')).to.deep.equal(['y', 'y', 'y', 'y', 'u', 'u', 'a(yv)'])
    done()
  })
})


