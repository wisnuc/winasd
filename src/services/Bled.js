const SerialPort = require('serialport')
const Readline = require('@serialport/parser-readline')
const EventEmitter = require('events')
const BaseState = require('../lib/state')
const debug = require('debug')('ws:bled')
const util = require('util')
const burnBLE = require('../lib/flash')

const COMMAND_CONNECT = 0x55
const COMMAND_PING = 0x30
const COMMAND_VERSION = 0x31
const COMMAND_STATION_ID = 0x32
const COMMAND_STATION_STATUS = 0x33
const COMMAND_BINDING_PROGRESS = 0x34

const BLED_COMMANDS = {
  COMMAND_CONNECT,
  COMMAND_PING,
  COMMAND_VERSION,
  COMMAND_STATION_ID,
  COMMAND_STATION_STATUS,
  COMMAND_BINDING_PROGRESS
}

/* validate response data */
const validate = (data) => {
  /* no data */
  if (!data || !data.length) return false
  /* wrong length */
  if (data[1] !== data.length) return false
  /* check sum */
  let sum = -data[2]
  data.slice(3, data.length).forEach(a => (sum += a))
  return !(sum % 256)
}

/* calculate checksum */
const checksum = (arr) => {
  let sum = 0x00
  arr.forEach(a => (sum += a))
  return sum % 256
}

/* generate string which consists of a-z,0-9 */
const generateSession = () => {
  let session = ''
  while (session.length !== 4) {
    session = Math.random().toString(36).substr(2, 4)
  }
  return session
}

class State extends BaseState {
  write (cmd, msg, cb) { process.nextTick(() => cb(new Error('Device Busy'))) }
  getVersion (cb) { process.nextTick(() => cb(new Error('Device Busy'))) }
  setStationId (id, cb) { process.nextTick(() => cb(new Error('Device Busy'))) }
  setStationStatus (status, cb) { process.nextTick(() => cb(new Error('Device Busy'))) }
  sendMsg (msg, cb) { process.nextTick(() => cb(new Error('Device Busy'))) }
}

class Connecting extends State {
  enter(port, baudRate) {
    this.serialPort = new SerialPort(port, { baudRate })
    this.serialPort.on('error', error => {
      this.destroy()
      this.setState('Disconnect', error)
    })

    this.timer = setTimeout(() => {
      const e = new Error('ETIMEOUT')
      this.destroy()
      this.setState('Disconnect', e)
    }, 1000)

    this.serialPort.once('data', (data) => {
      clearTimeout(this.timer)
      let bleMode
      if (data.toString('hex') === '00cc') {
        debug('BLE is in Bootloader mode, need flash firmware')
        bleMode = 'sbl'
        this.setState('Burning', this.serialPort)
      } else if (data.toString('hex') === '00aa') {
        debug('BLE is in application mode')
        bleMode =  'app'
        this.setState('Connected', this.serialPort)
      } else {
        const e = new Error('Unkonw Response')
        this.destroy()
        this.setState('Disconnect', e)
      }
    })

    this.serialPort.write(Buffer.from([COMMAND_CONNECT, COMMAND_CONNECT]), err => {
      if (err) {
        this.destroy()
        this.setState('Disconnect', err)
      }
    })
  }

  exit() {
    if (this.serialPort) { // jump to Connected state
      this.serialPort.removeAllListeners()
    }
    clearTimeout(this.timer)
  }

  destroy() {
    clearTimeout(this.timer)
    this.serialPort.removeAllListeners()
    this.serialPort.on('error', () => {})
    this.serialPort.close()
    this.serialPort = undefined
  }
}

class Connected extends State {
  enter(serialPort) {
    this.port = serialPort
    this.port.on('error', err => {
      this.setState('Disconnect', err)
    })
    this.session = generateSession()
    this.pingCount = 0
    this.writeQuene = []
    this.addParser()
    this.heartbeat()
  }

  addParser() {
    this.parser = this.port.pipe(new Readline({ delimiter: '\0\0', encoding: '' }))
    this.dataArray = []
    this.parser.on('data', (data) => {
      // debug('uart receive raw data', data)
      /* no data */
      if (!data || !data.length) return
      /* data does not starts with 0x00: SPS data */
      if (data[0] !== 0) {
        this.dataArray.push(data)
        if (data.length && data[data.length - 1] === 0x0A) { // data end with \n
          const pack = Buffer.concat(this.dataArray).toString().trim()
          console.log('Get pack:', pack)
          if (pack === 'scan') this.ctx.dispatch('CMD_SCAN', pack)
          if (pack === 'conn') this.ctx.dispatch('CMD_CONN', pack)
          this.dataArray.length = 0
        }
      } else if (data.length === 3 && data[1] === data[2] && [0x20, 0x21, 0x22, 0x23].includes(data[2])) { // BLE status
        switch (data[2]) {
          case 0x20:
            debug('BLE init')
            this.ctx.dispatch('BLE_INIT')
            break
          case 0x21:
            debug('BLE start advertising')
            this.ctx.dispatch('BLE_ADVERTISING')
            break
          case 0x22:
            debug('BLE connect to client')
            this.ctx.dispatch('BLE_CONNECTED_CLIENT')
            break
          case 0x23:
            debug('BLE disconnected with client')
            this.ctx.dispatch('BLE_DISCONNECTED_CLIENT')
            break
          default:
            break
        }
      } else if (data.length > 4 && validate(data)) { // check data, and resovle data from BLE
        switch (data[3]) {
          case COMMAND_PING:
            this.ctx.emit(COMMAND_PING, data)
            break
          case COMMAND_VERSION:
            this.ctx.emit(COMMAND_VERSION, data)
            break
          case COMMAND_STATION_ID:
            this.ctx.emit(COMMAND_STATION_ID, data)
            break
          case COMMAND_STATION_STATUS:
            this.ctx.emit(COMMAND_STATION_STATUS, data)
            break
          case COMMAND_BINDING_PROGRESS:
            this.ctx.emit(COMMAND_BINDING_PROGRESS, data)
            break
          default:
            break
        }
      } else if (data.toString('hex') === '00fdfd') {
        this.ctx.emit('SPS_RES', data)
      } else console.warn('Get unknown data', data)
    })
  }

  schedule () {
    // console.log('schedule', this.writeQuene.length, this.state)
    if (this.scheduleing) return
    if (!this.writeQuene.length ) return
    this.scheduleing = true
    const { cmd, msg, cb } = this.writeQuene.shift()    
    const timer = setTimeout(() => {
      this.ctx.removeAllListeners(cmd)
      const e = new Error('ETIMEOUT')
      cb(e)
      this.scheduleing = false
      this.schedule()
    }, 1000)

    this.ctx.once(cmd, (data) => {
      clearTimeout(timer)
      cb(null, data.slice(4, data.length))
      this.scheduleing = false
      this.schedule()
    })
    
    this.port.write(msg)
  }

  /* send cmd to BLE */
  write (cmd, msg, cb) {
    this.writeQuene.push({ cmd, msg, cb })
    this.schedule()
  }

  ping (cb) {
    const buf = Buffer.concat([Buffer.alloc(4), Buffer.from(this.session)])
    buf[0] = 0x00
    buf[1] = 0x08
    buf[3] = COMMAND_PING
    buf[2] = checksum(buf.slice(3))
    this.write(COMMAND_PING, buf, cb)
  }

  async pingAsync () {
    return util.promisify(this.ping).bind(this)()
  }

  heartbeat () {
    this.pingCount += 1
    // console.log('pingCount', this.pingCount)
    this.pingAsync().then(() => setTimeout(() => this.heartbeat(), 1000)).catch(e => e && console.error('heartbeat error', e))
  }

  getVersion (cb) {
    this.write(COMMAND_VERSION, Buffer.from([0x00, 0x04, COMMAND_VERSION, COMMAND_VERSION]), cb)
  }

  setStationId (id, cb) {
    if (!Buffer.isBuffer(id)) {
      const e = new Error('Id not Buffer')
      cb(e)
    } else {
      const size = id.length + 4
      const buf = Buffer.concat([Buffer.alloc(4), id])
      buf[0] = 0x00
      buf[1] = size
      buf[3] = COMMAND_STATION_ID
      buf[2] = checksum(buf.slice(3))
      this.write(COMMAND_STATION_ID, buf, cb)
    }
  }

  /* unint8_t status */
  setStationStatus (status, cb) {
    const buf = Buffer.alloc(5)
    buf[0] = 0x00
    buf[1] = 5
    buf[3] = COMMAND_STATION_STATUS
    buf[4] = status
    buf[2] = checksum(buf.slice(3))
    this.write(COMMAND_STATION_STATUS, buf, cb)
  }

  sendMsg (msg, cb) {
    this.write('SPS_RES', `${JSON.stringify(msg)}\n`, cb)
  }
}

class Burning extends State {
  enter() {
    burnBLE(this.ctx.port, this.ctx.bin, err => {
      if (err) {
        this.setState('BurnFailed', err)
      } else 
        this.setState('Connecting', this.ctx.port, this.ctx.baudRate)
    })
  }
}

class BurnFailed extends State {
  enter(err) {
    this.error = err
    debug(err)
    this.timer = setTimeout(() => {
      this.setState('Burning')
    }, 5000)
  }
}

class Disconnect extends State {
  enter(err) {
    this.error = err
    debug('Disconnect:', err.message)
    this.timer = setTimeout(() => {
      this.setState('Connecting', this.ctx.port, this.ctx.baudRate)
    }, 5000)
  }
}

class Bled extends EventEmitter {
  constructor(port, baudRate, bin) {
    super()
    this.port = port
    this.baudRate = baudRate
    this.bin = bin
    this.handers = new Map()
    new Connecting(this, this.port, this.baudRate)
  }

  addHandler(type, callback){
    if (this.handers.has(type)) {
      this.handers[type].push(callback)
    }
    else {
      this.handers[type] = [callback]
    }
  }

  dispatch(type, data) {
    if (this.handers.has(type)) {
      this.handers[type].foreach(cb => cb(data))
    }
  }

  write (...args) { this.state.write(...args) }
  getVersion (...args) { this.state.getVersion(...args) }
  setStationId (...args) { this.state.setStationId(...args) }
  setStationStatus (...args) { this.state.setStationStatus(...args) }
  sendMsg (...args) { this.state.sendMsg(...args) }
}

Bled.prototype.Connecting = Connecting
Bled.prototype.Connected = Connected
Bled.prototype.Disconnect = Disconnect
Bled.prototype.Burning = Burning
Bled.prototype.BurnFailed = BurnFailed
  
Bled.prototype.BLED_COMMANDS = BLED_COMMANDS

  
module.exports = Bled