const Bluetooth = require('../woodstock/winas/bluetooth')
const DBus = require('../woodstock/lib/dbus')
const NetWorkManager = require('../woodstock/nm/NetworkManager')
const { STRING } = require('../woodstock/lib/dbus-types')
const debug = require('debug')('ws:bled')

/**
 * BLED 负责初始化 debus对象
 * 由于ble和networkmanager 都使用debus提供服务，使用服务
 * 所以该模块负责初始化ble中的各种service以及NetworkManager对象
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
      this.ble = new Bluetooth(ctx.userStore && ctx.userStore.data || false, ctx.deviceSN)
      this.dbus.attach('/org/bluez/bluetooth', this.ble)
      this.nm = new NetWorkManager()
      this.dbus.attach('/org/freedesktop/NetworkManager', this.nm)
      this.emit('connect')
      this.initProperties()
    })
    this.handlers = new Map()
  }

  initProperties() {
    debug('initProperties')
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
      this.info = data[0].eval().reduce((o, [name, kv]) => Object.assign(o, { [name]: kv[1] }), {})
      debug(this.info)
    })
  }

  updateAdv() {
    this.ble && this.ble.updateAdv(this.ctx.userStore && this.ctx.userStore.data || false, this.ctx.deviceSN)
  }

  // ble 对象设置前如果上一个存在 先移除所有listeners, 然后在新的设置对象上挂载监听
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
    this._ble.on('NICChar1Write', this.handleBleMessage.bind(this, 'NICChar1Write'))
    this._ble.on('NICChar2Write', this.handleBleMessage.bind(this, 'NICChar2Write'))
  }

  get ble() { return this._ble }

  // 同设置ble对象一样
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

  // 处理来自某个ble service 的消息
  // service1 => localAuth service
  // service2 => network setting
  // service3 => cloud
  // NICChar1/NICChar2 => network interface service characteristics
  handleBleMessage(type, data) {
    let packet
    try {
      packet = JSON.parse(data)
    } catch(e) {
      return this.update(type, { code: 'ENOTJSON', message: 'packet error'})
    }

    if (type === 'Service1Write') return this.handleLocalAuth(type, packet)
    if (type === 'Service2Write') return this.handleNetworkSetting(type, packet)
    if (type === 'Service3Write') return this.handleCloud(type, packet)
    if (type === 'NICChar1Write') return this.handleNICChar1Write(type, packet)
    if (type === 'NICChar2Write') return this.handleNICChar2Write(type, packet)
    debug('invalid action: ', packet.action)
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
        this.nm.connect2(packet.body.ssid, packet.body.pwd, (err, data) => {
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

  handleNICChar1Write(type, packet) {
    if (packet.action === 'list') {
      return this.update(type, {seq: packet.seq, data:{ devices:this.nm.devices }})
    }
  }

  // push model
  handleNICChar2Write(type, packet) {
    if (packet.action === 'list') {
      return this.update(type, {seq: packet.seq, data:{ devices:this.nm.devices }})
    }
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
      debug(this.ble[type.slice(0, type.length - 5)+ 'Update'], data)
      data = Buffer.from(JSON.stringify(data))
      
      this.ble[type.slice(0, type.length - 5) + 'Update'](data)
    }
  }
}

module.exports = BLED