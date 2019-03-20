const {
  STRING, OBJECT_PATH, ARRAY, DICT_ENTRY, VARIANT, BYTE, BOOLEAN
} = require('../lib/dbus-types')

/**
 * registe accesspoint change signals
 * events:
 * NM_AP_AccessPointAdded
 * NM_AP_AccessPointRemoved
 */
class AccessPoints {
  constructor(ctx) {
    this.ctx = ctx
    this.aps = []
    this.handleFunc = m => { // TODO:  emit events here
      if (m.member === 'AccessPointAdded') {
        this.aps.push(m.body[0].eval())
        this.ctx.emit('NM_AP_AccessPointAdded', m.body[0].value)
      } else if (m.member === 'AccessPointRemoved') {
        let index = this.aps.findIndex(x => x === m.body[0].eval())
        if (index !== -1) {
          this.aps = [...this.aps.slice(0,index), ...this.aps.slice(index + 1)]
        }
        this.ctx.emit('NM_AP_AccessPointRemoved', m.body[0].value)
      }
    }
    Object.defineProperty(this, 'primDevice', {
      set (v) {
        if (this._device) {
          this.ctx.removeSignalHandle(this._device, this.handleFunc) // remove old handler
        }
        this._device = v
        if (v)
          this.ctx.addSignalHandle(v, this.handleFunc.bind(this))
      },
      get() {
        return _device
      }
    })
  }

  //集合方法
  /**
   * 
   * @param {string} objPath - Device ObjectPath
   */
  RequestScan(objPath, callback) {
    this.ctx.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: objPath,
      'interface': 'org.freedesktop.NetworkManager.Device.Wireless',
      member: 'RequestScan',
      signature: 'a{sv}',
      body: [
        new ARRAY('a{sv}')
      ]
    }, (err, data) => callback && callback(err, data))
  }

  /**
   * 
   * @param {string} objPath - Device ObjectPath
   * @param {function} callback 
   */
  GetAccessPoints(objPath, callback) {
    this.ctx.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: objPath,
      'interface': 'org.freedesktop.DBus.Properties',
      member: 'Get',
      signature: 'ss',
      body: [
        new STRING('org.freedesktop.NetworkManager.Device.Wireless'),
        new STRING('AccessPoints')
      ]
    }, (err, data) => {
      if (err) return callback(err)
      if (data && data.length == 1 && Array.isArray(data[0].elems) && data[0].elems.length == 2 && Array.isArray(data[0].elems[1].elems)) {
        let elems = data[0].elems[1].elems
        return callback(null, elems.map(x => x.value))
      } else 
        callback(null, [])
    })
  }

  //单例方法
  /**
   * 
   * @param {string} objPath - AccessPoint ObjectPath
   * @param {function} callback 
   *   dbus-send --system --dest=org.freedesktop.NetworkManager --print-reply /org/freedesktop/NetworkManager/Devices/2 \
   *   org.freedesktop.DBus.Properties.Get string:org.freedesktop.NetworkManager.Device.Wireless string:AccessPoints
   */
  GetAccessPointProperties(objPath, callback) {
    this.ctx.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: objPath,
      'interface': 'org.freedesktop.DBus.Properties',
      member: 'GetAll',
      signature: 's',
      body: [
        new STRING('org.freedesktop.NetworkManager.AccessPoint')
      ]
    }, (err, data) => {
      if (err) return callback(err)
      let d = {}
      data[0].elems.forEach(x => {
        let name = x.elems[0].value
        let value
        let valueElem = x.elems[1].elems
        if (valueElem[1].hasOwnProperty('value')) {
          value = valueElem[1].value
        } else {
          value = valueElem[1].elems.map(x => x.value)
          if (name === 'Ssid' && value.length) {
            value = Buffer.from(value).toString()
          }
        }
        d[name] = value
        d.objectPath = objPath
      })
      callback(null, d)
    })
  }

  listen(m) {

  }

  mounted() {
    this.ctx.getWirelessDevices((err, data) => {
      if (err || !data.length) return console.log('AccessPoints mounted but no wireless device')
      let device = data[0]
      this.primDevice = device
      console.log('AccessPoints mounted, start listening', device)
      this.ctx.dbus.driver.signal({
        path: device,
        interface: 'org.freedesktop.NetworkManager.Device.Wireless',
        member: 'AccessPointAdded',
        signature: 'o',
        body: [
          new OBJECT_PATH(this.ctx.objectPath())
        ]
      })
  
      this.ctx.dbus.driver.signal({
        path: device,
        interface: 'org.freedesktop.NetworkManager.Device.Wireless',
        member: 'AccessPointRemoved',
        signature: 'o',
        body: [
          new OBJECT_PATH(this.ctx.objectPath())
        ]
      })
    })
  }

  logout() {

  }
}

module.exports = AccessPoints