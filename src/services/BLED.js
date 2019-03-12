const Bluetooth = require('../woodstock/winas/bluetooth')
const DBus = require('../woodstock/lib/dbus')
const NetWorkManager = require('../woodstock/nm/NetworkManager')

/**
 * definition bluetooth packet
 * 
 * {
 *    action: 'scan'/'conn'/'net'/
 *    seq: 1000,
 *    token: '', optional 
 *    body:{}
 * }
 */

class BLED extends require('events') {
  constructor(ctx) {
    super()
    this.ctx = ctx
    this.dbus = new DBus()
    this.dbus.on('connect', () => {
      this.ble = Bluetooth()
      this.dbus.attach('/org/bluez/bluetooth', this.ble)
      this.nm = new NetWorkManager()
      this.dbus.attach('/org/freedesktop/NetworkManager', this.nm)
    })
    this.handlers = new Map()
  }

  set ble(x) {
    if (this._ble) {
      this._ble.removeAllListeners()
    }
    this._ble = x
    this._ble.on('Service1Write', this.handleBleMessage.bind(this, 'Service1Write')) // LocalAuth
    this._ble.on('Service2Write', this.handleBleMessage.bind(this, 'Service2Write')) // NetSetting
    this._ble.on('Service3Write', this.handleBleMessage.bind(this, 'Service3Write')) // Cloud
  }

  get ble() { return this._ble }

  handleBleMessage(type, data, opts) {
    let packet
    try {
      packet = JSON.parse(data)
    } catch(e) {
      return this.update(type, { code: 'ENOTJSON', message: 'packet error'})
    }

    if (type === 'Service1Write') return this.handleLocalAuth(type, packet)
    if (type === 'Service2Write') return this.handleNetworkSetting(type, packet)
    if (type === 'Service3Write') return this.handleCloud(type, packet)
    console.log('invalid action: ', packet.action)
  }


  handleLocalAuth(type, packet) {
    if (packet.action === 'req') {
      this.ctx.localAuth.request((err, data) => {
        if (err) return this.update(type, { seq: packet.seq, error: err })
        return this.update(type, { seq: packet.seq, data})
      })
    } else if (packet.action == 'auth') {
      this.ctx.localAuth.auth(packet.body, (err, data) => {
        if (err) return this.update(type, { seq: packet.seq, error: err })
        return this.update(type, {seq: packet.seq, data})
      })
    }
  }

  /**
   * action: auth/conn
   * data: {token}/{ssid, pwd}
   */
  handleNetworkSetting(type, packet) {
    if (packet.action === 'conn') {
      if (this.ctx.localAuth.verify(packet.token)) {
        this.nm.connect(packet.body.ssid, packet.body.pwd, (err, data) => {
          if (err) return this.update(type, { seq: packet.seq, error: err })
          return this.update(type, {seq: packet.seq, data})
        })
      } else {
        let error = Object.assign(new Error('auth failed'), { code: 'EAUTH' })
        return this.update(type, { seq: packet.seq, error })
      }
    }
  }

  handleCloud(type, packet) {

  }

  addHandler(type, callback){
    if (this.handlers.has(type)) {
      this.handlers.get(type).push(callback)
    }
    else {
      this.handlers.set(type, [callback])
    }
  }

  dispatch(type, data) {
    if (this.handlers.has(type)) {
      this.handlers.get(type).forEach(cb => cb(data))
    }
  }

  view() {
    return {
      state: this.ble ? 'Started' : 'Starting',
      address: 'XXXXX:XXXX:XXXX:XXXXX'
    }
  }

  update(type, data) {
    if (this.ble) {
      console.log(this.ble[type.slice(0, 8)+ 'Update'], data)
      
      data = Buffer.from(JSON.stringify(data))
      
      this.ble[type.slice(0, 8)+ 'Update'](data)
    }
  }

  setStationId (id) {}

  setStationStatus (status) {}

  sendMsg (msg) {}
}

module.exports = BLED