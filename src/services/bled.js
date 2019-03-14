const Bluetooth = require('../woodstock/winas/bluetooth')
const DBus = require('../woodstock/lib/dbus')
const NetWorkManager = require('../woodstock/nm/NetworkManager')
const { STRING } = require('../woodstock/lib/dbus-types')

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
    
    // TODO:  dbus disconnect??? connect failed??
    this.dbus.on('connect', () => {
      this.ble = new Bluetooth(this.ctx.userStore.data, this.ctx.deviceSN)
      this.dbus.attach('/org/bluez/bluetooth', this.ble)
      this.nm = new NetWorkManager()
      this.dbus.attach('/org/freedesktop/NetworkManager', this.nm)
      this.emit('connect')
      this.initProperties()
    })
    this.handlers = new Map()
  }

  initProperties() {
    if (!this.ble) return setTimeout(() => this.initProperties(), 1000)
    this.ble.dbus.driver.invoke({
      destination: 'org.bluez',
      path: '/org/bluez/hci0',
      'interface': 'org.freedesktop.DBus.Properties',
      member: 'GetAll',
      signature: 's',
      body:[
        new STRING('org.bluez.Adapter1')
      ]
    }, (err, data) => {
      if (err) return setTimeout(() => this.initProperties(), 1000)
      let info = {}
      data[0].elems.forEach(x => {
        let name = x.elems[0].value
        let esig = x.elems[1].esig
        let value = undefined
        switch (esig) {
          case 's':
          case 'b':
          case 'u':
            value = x.elems[1].elems[1].value
            break
          case 'as':
            value = x.elems[1].elems[1].elems.map(x => x.value)
          default:
            break
        }
        info[name] = value
      })
      this.info = info
      console.log(this.info)
    })
  }

  set ble(x) {
    if (this._ble) {
      this._ble.removeAllListeners()
    }
    this._ble = x
    this._ble.on('Service1Write', this.handleBleMessage.bind(this, 'Service1Write')) // LocalAuth
    this._ble.on('Service2Write', this.handleBleMessage.bind(this, 'Service2Write')) // NetSetting
    this._ble.on('Service3Write', this.handleBleMessage.bind(this, 'Service3Write')) // Cloud
    this._ble.on('BLE_DEVICE_DISCONNECTED', () => this.emit('BLE_DEVICE_DISCONNECTED')) // Device Disconnected
    this._ble.on('BLE_DEVICE_CONNECTED', () => this.emit('BLE_DEVICE_CONNECTED')) // Device Connected
  }

  get ble() { return this._ble }

  set nm(x) {
    if (this._nm) this._nm.removeAllListeners()
    this._nm = x
    x.on('NM_DeviceChanged', (...args) => this.emit('NM_DeviceChanged', ...args))
    x.on('NM_StateChanged', (...args) => this.emit('NM_StateChanged', ...args))
    x.on('NM_ST_ConnectionChanged', (...args) => this.emit('NM_ST_ConnectionChanged', ...args))
    x.on('NM_AP_AccessPointAdded', (...args) => this.emit('NM_AP_AccessPointAdded', ...args))
    x.on('NM_AP_AccessPointRemoved', (...args) => this.emit('NM_AP_AccessPointRemoved', ...args))
  }

  get nm() {
    return this._nm
  }

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
    if (packet.action === 'addAndActive') {
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
      address: this.info && this.info.Address || 'XX:XX:XX:XX:XX:XX',
      info: this.info
    }
  }

  update(type, data) {
    if (this.ble) {
      console.log(this.ble[type.slice(0, 8)+ 'Update'], data)
      
      data = Buffer.from(JSON.stringify(data))
      
      this.ble[type.slice(0, 8)+ 'Update'](data)
    }
  }
}

module.exports = BLED