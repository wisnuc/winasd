const { spawn, exec } = require('child_process')
const events = require('events')
const readline = require('readline')
const debug = require('debug')('wd:net')

class State {

  constructor(ctx, ...args) {
    this.ctx = ctx
    ctx.state = this
    this._enter(...args)
    ctx.emit(this.constructor.name)
  }

  setState (state, ...args) {
    this._exit()
    let NextState = this.ctx[state]
    new NextState(this.ctx, ...args)
  }

  _enter () {
    debug(`${this.ctx.constructor.name} enter ${this.constructor.name} state`)
    this.enter()
  }

  enter () {

  }

  _exit () {
    this.exit()
    debug(`${this.ctx.constructor.name} exit ${this.constructor.name} state`)
  }

  exit() {

  }

  init (cb) {
    process.nextTick(() => cb(new Error('Device Busy')))
  }

  async initAsync() {
    return new Promise((resolve, reject) => reject(new Error('Device Busy')))
  }

  scan (cb) {
    this.setState('Scanning', cb)
  }

  view () {
    return null
  }

  destroy () {
    this.exit()
  }
}

class Idle extends State {
  init (cb) {
    this.setState('Init', cb)
  }

  async initAsync() {
    return new Promise((resolve, reject) => {
      this.setState('Init', (err, data) => {
        err ? reject(err) : resolve(data)
      })
    })
  }
}

class Waiting extends State {}

class Scanning extends State {
  enter(cb) {
    if (cb) this.cbs = [cb] 
  }

  scan (cb) {
    this.cbs = this.cbs ? [...this.cbs, cb] : [cb]
  }

  exit() {
  }
}

class Connecting extends State {

}

class Disconnecting extends State {

}

class Disconnected extends State {

}

class Connected extends State {

}

class InitFailed extends State {
  enter(error) {
    this.error = error
  }

  init (cb) {
    this.setState('Init', cb)
  }

  async initAsync() {
    return new Promise((resolve, reject) => {
      this.setState('Init', (err, data) => {
        err ? reject(err) : resolve(data)
      })
    })
  }
}

class Init extends State {

  enter (cb) {
    this.callback = cb
    this.child = exec(`nmcli d | grep wifi`, (error, stdout, stderr) => {
      if (error || stderr) {
        this.error = error || stderr
        return this.setState('InitFailed', this.error)
      }
      else {
        const nic = {}
        try {
          const arr = stdout.split(/\s+/)
          nic.name = arr[0]
          nic.type = arr[1]
          nic.state = arr[2]
          nic.connection = arr[3]
        } catch (err) {
          const e = new Error('No Wifi Device')
          this.error = e
          return this.setState('InitFailed', this.error)
        }
        debug(nic)
        if (!nic.name || nic.type !== 'wifi') {
          const e = new Error('Init Wifi Device Error')
          this.error = e
          return this.setState('InitFailed', this.error)
        }
        this.data = nic.name
        this.ctx.device = this.data
        let connected = (nic.state === 'connected')
        this.setState(connected ? 'Connected': 'Waiting')
      }
    })
  }

  scan(cb) {
    process.nextTick(() => cb(new Error('Device Busy')))
  }

  connect(essid, key, cb) {
    process.nextTick(() => cb(new Error('Device Busy')))
  }

  disconnect(cb) {
    process.nextTick(() => cb(new Error('Device Busy')))
  }

  exit() {
    if (!this.child.killed) {
      this.child.kill()
      this.callback(new Error('Killed'))
    } else {
      this.error ? this.callback(this.error) : this.callback(null, this.data)
    }
  }
}

class Net extends events {
  constructor() {
    super()
    new Idle()
  }


  
}

Net.prototype.Idle = Idle
Net.prototype.Scanning = Scanning
Net.prototype.Disconnected = Disconnected
Net.prototype.Disconnecting = Disconnecting
Net.prototype.Connecting = Connecting
Net.prototype.Connected = Connected
Net.prototype.Init = Init
Net.prototype.InitFailed = InitFailed