const i2c = require('i2c-bus')
const ECC = require('./ecc')
const { Signature } = require('./csr')

class Wrapper {
  constructor (ecc) {
    this.ecc = ecc
    this.q = []
  }

  _run () {
    let { opts, callback } = this.q[0]
    this.ecc[opts.op](opts, (err, data) => {
      if (!this.q.length) return
      this.q.shift()
      if (this.q.length) this._run()
      callback(err, data)
    })
  }

  run (opts, callback) {
    this.q.push({ opts, callback })
    if (this.q.length === 1) this._run()
  }

  preset (callback = () => {}) {
    this.run({ op: 'preset' }, callback)
  }

  sign (opts, callback) {
    this.run(Object.assign({ op: 'sign' }, opts), (err, sig) => {
      if (err) {
        callback(err)
      } else if (opts.der) {
        callback(null, Signature(sig))
      } else {
        callback(null, sig)
      }
    })
  }

  verify (opts, callback) {
    this.run(Object.assign({ op: 'verify' }, opts), callback)
  }

  genCsr (opts, callback) {
    this.run(Object.assign({ op: 'genCsr' }, opts), callback)
  }

  serialNumber (opts, callback) {
    this.run(Object.assign({ op: 'serialNumber' }, opts), callback)
  }
}

const initEcc = (busNum, callback) => {
  let bus = i2c.open(busNum, err => {
    if (err) return callback(err)
    let ecc = new ECC(bus)
    ecc.scan(err => {
      if (err) {
        ecc.close()
        callback(err)
      } else {
        ecc.busNum = busNum
        callback(null, new Wrapper(ecc))
      }
    })
  })
}

module.exports = initEcc
