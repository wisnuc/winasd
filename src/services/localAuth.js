const crypto = require('crypto')

const KEYS = 'abcdefg12345678'.split('')
const RandomKey = () => KEYS.map(x => KEYS[Math.round(Math.random()*14)]).join('')

class LocalAuth {
  constructor(ctx) {
    this.ctx = ctx
    this._state = 'Idle' // 'Workding'
    this.timer = undefined // working timer
    this.secret = RandomKey()
    Object.defineProperty(this, 'state', {
      get() {
        return this._state
      },
      set(v) {
        console.log('Local Auth Change State :  ', this._state, '  ->  ', v)
        this._state = v
      }
    })
  }

  request(callback) {
    if (this.state === 'Idle') {
      this.state = 'Working'
      this.timer = setTimeout(() => {
        this.state = 'Idle'
      }, 60 * 1000)
      callback(null, { colors: ['120', '203', '123', '102']})
    } else {
      callback(Object.assign(new Error('busy'), { code: 'EBUSY'}))
    }
  }

  auth(data, callback) {
    if (this.state !== 'Working') return callback(Object.assign(new Error('error state'), { code: 'ESTATE'}))
    clearTimeout(this.timer)
    // check data maybe led colors

    // create token
    let cipher = crypto.createCipher('aes128', this.secret)
    let token = cipher.update(JSON.stringify({
      from: 'ble',
      ctime: new Date().getTime()
    }), 'utf8', 'hex')
    token += cipher.final('hex')
    // return
    callback(null, { token })
    this.state = 'Idle'
  }

  verify(token) {
    try{
      let decipher = crypto.createDecipher('aes128', this.secret)
      let data = decipher.update(token, 'hex', 'utf8')
      data += decipher.final('utf8')
      data = JSON.parse(data)
      if (!data.ctime || !Number.isInteger(data.ctime) || Date.now() - data.ctime > 1000 * 60 * 60) {
        return false
      }
      return true
    }catch {
      return false
    }
  }
}

module.exports = LocalAuth