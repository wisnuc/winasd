const BaseState = require('../lib/state')

class State extends BaseState {

}

class Idle extends State {

}

class Authed extends State {

  enter() {
    this.timer = setTimeout(() => {
      this.setState('Idle')
    }, 60 * 1000 * 5)
  }

  exit() {
    clearTimeout(this.timer)
  }
}

class Setting extends State {
  enter(ssid, pwd) {

  }
}

class NetWork extends require('event') {
  constructor(ctx) {
    super()
    this.ctx = ctx
    this.ctx.bled.on('NM_DeviceChanged', (...args) => this.emit('NM_DeviceChanged', ...args))
    this.ctx.bled.on('NM_StateChanged', (...args) => this.emit('NM_StateChanged', ...args))
    this.ctx.bled.on('NM_ST_ConnectionChanged', (...args) => this.emit('NM_ST_ConnectionChanged', ...args))
    this.ctx.bled.on('NM_AP_AccessPointAdded', (...args) => this.emit('NM_AP_AccessPointAdded', ...args))
    this.ctx.bled.on('NM_AP_AccessPointRemoved', (...args) => this.emit('NM_AP_AccessPointRemoved', ...args))
  }

  handleDeviceChanged() {

  }

  handleStateChanged() {

  }

}

module.exports = NetWork