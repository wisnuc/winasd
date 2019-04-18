const crypto = require('crypto')

const deepEqual = require('fast-deep-equal')

const KEYS = 'abcdefg12345678'.split('')
const RandomKey = () => KEYS.map(x => KEYS[Math.round(Math.random()*14)]).join('')

const COLORS = [
  ['#ff0000', 'alwaysOn'], ['#00ff00', 'alwaysOn'], ['#0000ff', 'alwaysOn'],
  ['#ff0000', 'breath'], ['#00ff00', 'breath'], ['#0000ff', 'breath']]
const CreateArgs = () => COLORS[Math.floor(Math.random() * 6)]

/**
 * 物理验证
 * 通过灯光闪烁或者物理按键等方式对操作用户鉴权
 * 确认用户确实持有设备
 */
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
        if (v === 'Idle') this.args = undefined 
        this._state = v
      }
    })
  }

  request(callback) {
    if (this.state === 'Idle') {
      let args = CreateArgs()
      try {
        this.ctx.ledService.run(args[0], args[1], 60 * 1000) // start led
        this.args = args
        this.state = 'Working'
        this.timer = setTimeout(() => this.stop(), 60 * 1000)
        process.nextTick(() => callback(null, { colors: COLORS}))
      } catch(e) {
        this.stop()
        process.nextTick(() => callback(Object.assign(e, { code: 'ELED'})))
      }
    } else {
      process.nextTick(() => callback(Object.assign(new Error('busy'), { code: 'EBUSY'})))
    }
  }

  stop() {
    if (this.state === 'Idle') return
    clearTimeout(this.timer)
    try{
      this.ctx.ledService.stop() //stop led, may throw error
    } catch(e) {console.log('stop led error: ', e)}
    this.state = 'Idle'
  }

  auth(data, callback) {
    if (this.state !== 'Working')
      return callback(Object.assign(new Error('error state'), { code: 'ESTATE'}))
    // check data maybe led colors
    if (!data.color || !deepEqual(data.color, this.args)) 
      return callback(Object.assign(new Error('color error'), { code: 'ECOLOR'}))
    // create token
    let cipher = crypto.createCipher('aes128', this.secret)
    let token = cipher.update(JSON.stringify({
      from: 'ble',
      ctime: new Date().getTime()
    }), 'utf8', 'hex')
    token += cipher.final('hex')
    this.stop()

    process.nextTick(() => callback(null, { token }))
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