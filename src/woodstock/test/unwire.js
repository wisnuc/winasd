const path = require('path')
const chai = require('chai') 
const expect = chai.expect

const unwire = require('lib/unwire')

const ms1 = `
6c 02 01 01 0b 00 00 00 01 00 00 00 3d 00 00 00
06 01 73 00 06 00 00 00 3a 31 2e 31 39 36 00 00
05 01 75 00 01 00 00 00 08 01 67 00 01 73 00 00
07 01 73 00 14 00 00 00 6f 72 67 2e 66 72 65 65
64 65 73 6b 74 6f 70 2e 44 42 75 73 00 00 00 00
06 00 00 00 3a 31 2e 31 39 36 00 
`

describe(path.basename(__filename), () => {

  it('should say hello', done => {
    let buf = Buffer.from(ms1.replace(/\W/g, ''), 'hex')
    let header = unwire(buf, 0, 80, 'yyyyuua(yv)')
    done()
  })

})
