const i2c = require('i2c-bus')

class State {
  constructor(ctx, ...args) {
    this.ctx = ctx
    this.ctx.state = this
    this.enter(...args)
  }

  setState(NextState, ...args) {
    this.exit()
    new NextState(this.ctx, ...args)
  }

  enter() {}
  exit() {}
}

class Init extends State {
  enter(BUS_NUMBER) {
    this.ctx.i2c1 = i2c.openSync(BUS_NUMBER)
    this.ctx.set(0x00, 0x55) // reboot
    this.ctx.set(0x01, 0x01) // reboot
    this.ctx.set(0x03, 0x00) // max brightness
    this.ctx.set(0x07, 0x07) // enable all 
    this.ctx.set(0x08, 0x08) // require in multi color mode
    this.ctx.setPWMS(0x55, 0x55, 0x55)
    this.setState(StandBy)
  }
}

class StandBy extends State{
  enter() {
    let [r, g, b] = convertColor(this.ctx.defaultColor || '#00ff00')
    

    this.ctx.setLedMode(0x06)
    this.ctx.setLed1(r, g, b)
    this.ctx.setPWMS(0X55)
  }
}

class Working extends State {

  enter(color, type, time = 0, times = 0) {
    let [r, g, b] = convertColor(color)
    this.color = color
    this.type = type
    this.time = time
    this.times = times
    this.lightTimes = 0
    this.closeTimer = null
    this.nextTimer = null
    this.light = false
    this.ctx.setLedMode(0x06)
    this.ctx.setLed1(r, g, b)
    this.ctx.setPWMS()
    this.ctx.setTRiseAndOn(0x33)
    this.ctx.setTFallAndOff(0x33)

    this.createNextTimer()
    if (time) this.closeTimer = setTimeout(() => {
      console.log('in close timer')
      this.setState(StandBy)
    }, time)

  }

  exit() {
    clearTimeout(this.nextTimer)
    clearTimeout(this.closeTimer)
  }

  createNextTimer () {
    this.nextTimer = setTimeout(() => {
      this.ctx.setPWMS(this.light? null: 0x55)
      if (!this.light) {
        if (this.times > 0 && this.lightTimes >= this.times ) return this.setState(StandBy)
        if (this.type == 'alwaysOn') return
      } else {
        this.lightTimes ++
      }
      this.light = !this.light
      this.createNextTimer()
    }, 500)
  }
}

class Err extends State {
  enter(err) {
    this.message = err.message
  }
}

class LEDControl {
  constructor(BUS_NUMBER, AW2015FCR_ADDR, defaultColor) {
    this.i2c1 = null
    this.state = null
    this.busNumber = BUS_NUMBER
    this.addr = AW2015FCR_ADDR
    this.defaultColor = defaultColor
  }

  init() {
    try {
      new Init(this, this.busNumber)
    } catch (error) { 
      this.state.setState(Err, error)
      throw error
    }
  }

  set(cmd, byte) {
    if (!this.i2c1) throw new Error('Not initialized yet')
    this.i2c1.writeByteSync(this.addr, cmd, byte)
  }

  get(cmd, num) {
    if (!this.i2c1) throw new Error('Not initialized yet')
    let result =  this.i2c1.readByteSync(this.addr, cmd)
    return `${!num?'0x':''}${result.toString(num || 16)}`
  }

  getName() { return this.state.constructor.name}

  setLedMode (value) {
    // 0x07 pattern mode
    // 0x06 manual mode
    this.set(0x04, value)
    this.set(0x05, value)
    this.set(0x06, value)
  }

  setLed1(r, g, b) {
    this.set(0x10, r)
    this.set(0x11, g)
    this.set(0x12, b)
  }
  
  setLed([r1, r2, r3, r4], [g1, g2, g3, g4], [b1, b2, b3, b4]) {
    this.set(0x10, r1 || 0x00)
    this.set(0x13, r2 || 0x00)
    this.set(0x16, r3 || 0x00)
    this.set(0x19, r4 || 0x00)  
    this.set(0x11, g1 || 0x00)
    this.set(0x14, g2 || 0x00)
    this.set(0x17, g3 || 0x00)
    this.set(0x1A, g4 || 0x00)  
    this.set(0x12, b1 || 0x00)
    this.set(0x15, b2 || 0x00)
    this.set(0x18, b3 || 0x00)
    this.set(0x1B, b4 || 0x00)  
  }
  
  // PWMs
  setPWMS (l1, l2, l3) {
    this.set(0x1C, l1 || 0x00)
    this.set(0x1D, l2 || 0x00)
    this.set(0x1E, l3 || 0x00)
  }
  
  setTRiseAndOn(v1, v2, v3) {
    this.set(0x30, v1 || 0x00)
    this.set(0x35, v2 || 0x00)
    this.set(0x3A, v3 || 0x00)
  }
  
  setTFallAndOff(v1, v2, v3) {
    this.set(0x31, v1 || 0x00)
    this.set(0x36, v2 || 0x00)
    this.set(0x3B, v3 || 0x00)
  }
  
  setTSlotAndDelay(v1, v2, v3) {
    this.set(0x32, v1 || 0x00)
    this.set(0x37, v2 || 0x00)
    this.set(0x3C, v3 || 0x00)
  }

  setPattern(v1, v2, v3) {
    this.set(0x33, v1 || 0x00)
    this.set(0x38, v2 || 0x00)
    this.set(0x3D, v3 || 0x00)
  }

  setTimes(v1, v2, v3) {
    this.set(0x34, v1 || 0x00)
    this.set(0x39, v2 || 0x00)
    this.set(0x3E, v3 || 0x00)
  }

  run(color, type, time, times) {
    if (!['alwaysOn', 'breath'].includes(type)) throw new Error('illegal type')
    if (time && typeof time !== 'number') throw new Error('illegal time')
    if (times && typeof times !== 'number') throw new Error('illegal times')
    this.state.setState(Working, color, type, time, times)
  }

  stop() {
    this.state.setState(StandBy)
  }

  view() {
    return {
      state: this.state.constructor.name
    }
  }
}

function convertColor(color) {
  let match = color.match(/^(#[0-9a-fA-F]{6}){1}$/g)
  if (!match) throw new Error('color is illegal')
  return [
    parseHex(color.substring(1,3)), 
    parseHex(color.substring(3,5)), 
    parseHex(color.substring(5,7))
  ]
}

function parseHex(number) {
  return parseInt(number, 16)
}

// let m = new LEDControl(3, 0x64)
// try {
//   m.init()
// } catch (error) {
//   console.log('catch error', error)
// }


// 常亮
// m.run('#ffffff', 'alwaysOn')
// 闪烁 5秒
// m.run('#ffffff', 'breath', 5000)
// 闪烁 3次
// m.run('#0000ff', 'breath', null, 3)


/* class StandBy extends State {
  constructor(ctx) {
    super(ctx)
  }
  enter() {
    this.ctx.set(0x01, 0x00)
  }
}
class Working extends State {
  constructor(ctx, ...args) {
    super(ctx, ...args)
  }
  enter(color, type, time = 0, times = 0, weight = 0) {
    this.color = color
    this.type = type
    this.time = time
    this.finish = false
    this.closeTimer = null
    this.finishTimer = null
    let [r, g, b] = convertColor(color)
    
    this.ctx.set(0x01, 0x01) // enter active
    this.ctx.setLed1(r, g, b) // set color
    if (type == 'alwaysOn') {
      // manual mode
      this.ctx.setLedMode(0x00)
    } else if (type == 'blink' || type == 'breath') {
      // pattern mode
      this.ctx.setLedMode(0x01)
      // speed config
      this.ctx.setTRiseAndOn(0x33)
      this.ctx.setTFallAndOff(0x33)
      this.ctx.setTSlotAndDelay(0x33)
      this.ctx.setPattern(0x00)
      this.ctx.setTimes(0x00)
      // pattern config
      if (times) {
        console.log(`limit times ${times}`)
        this.ctx.setPattern(parseInt(`10000000`, 2))
        this.ctx.setTimes(times)
        // pulling 0x02 
        this.finishTimer = setInterval(() => {
          if (this.ctx.get(0x02) == '0x0') {
            console.log(`in finish timer`)
            this.finish = true
            this.clear()
          }
        }, 500)
      }
      // active time
      if (time) {
        console.log(`limit time ${time}`)
        this.closeTimer = setTimeout(() => {
          console.log(`in close timer`)
          this.setState(StandBy)
        }, time * 1000)
      }
      
      this.ctx.set(0x09, 0x01)
    }
  }
  clear() {
    clearTimeout(this.closeTimer)
    clearInterval(this.finishTimer)
  }
  exit() {
    this.clear()
    this.ctx.setLedMode(0x01)
    this.ctx.stop()
    
  }
  isFinish() {
    this.ctx.get(0x02)
    this.ctx.get(0x04)
    this.ctx.get(0x05)
    this.ctx.get(0x06)
  }
}
*/

module.exports = LEDControl