const debug = require('debug')('ws:net')
/*
  NetworkManager State
  NM_STATE_UNKNOWN = 0 
  NM_STATE_ASLEEP = 10 
  NM_STATE_DISCONNECTED = 20
  NM_STATE_DISCONNECTING = 30
  NM_STATE_CONNECTING = 40
  NM_STATE_CONNECTED_LOCAL = 50
  NM_STATE_CONNECTED_SITE = 60 
  NM_STATE_CONNECTED_GLOBAL = 70
  */
class NetWorkManager extends require('events') {
  constructor(ctx) {
    super()
    this.ctx = ctx
    this.ctx.bled.on('NM_DeviceChanged', (...args) => this.emit('NM_DeviceChanged', ...args))
    this.ctx.bled.on('NM_StateChanged', (...args) => (this.emit('NM_StateChanged', ...args), this.handleStateChanged(...args)))
    this.ctx.bled.on('NM_ST_ConnectionChanged', (...args) => (this.emit('NM_ST_ConnectionChanged', ...args), this.handleConnectionChanaged(...args)))
    this.ctx.bled.on('NM_AP_AccessPointAdded', (...args) => this.emit('NM_AP_AccessPointAdded', ...args))
    this.ctx.bled.on('NM_AP_AccessPointRemoved', (...args) => this.emit('NM_AP_AccessPointRemoved', ...args))
    this.initState()
  }

  initState() {
    this.ctx.bled.nm.State((err, data) => {
      this.emit('started', this.hasOwnProperty('state') ? this.state : err ? 0 : data) 
      if (this.hasOwnProperty('state')) return
      if (err) return setTimeout(() => this.initState(), 1000)
      this.state = data || 0
    })
    this.ctx.bled.nm.addressDatas((err, data) => {
      if (data) this.addresses = data
    })
  }

  connect(ssid, pwd, callback) {
    this.ctx.bled.nm ? this.ctx.bled.nm.connect(ssid, pwd, callback)
      : callback(new Error('nm not started'))
  }

  handleDeviceChanged() {

  }

  handleConnectionChanaged() {
    debug('handleConnectionChanaged')
  }

  handleStateChanged(state) {
    debug('handleStateChanged', state)
    this.state = state
    if (state === 70) this.emit('connect')
    // FIXME: race
    this.ctx.bled.nm.addressDatas((err, data) => {
      if (data) this.addresses = data
    })
  }

  view() {
    return {
      state: this.state,
      addresses: this.addresses
    }
  }
}

module.exports = NetWorkManager