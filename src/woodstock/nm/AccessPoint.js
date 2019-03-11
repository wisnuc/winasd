class AccessPoints {

  constructor(ctx) {
    this.ctx = ctx
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

  registerSignals() {
    
    this.ctx.dbus.driver.signal({
      path: '/org/freedesktop/NetworkManager/Devices/2',
      interface: 'org.freedesktop.NetworkManager.Device.Wireless',
      member: 'AccessPointAdded',
      signature: 'o',
      body: [
        new OBJECT_PATH(this.objectPath())
      ]
    })

    this.ctx.dbus.driver.signal({
      path: '/org/freedesktop/NetworkManager/Devices/2',
      interface: 'org.freedesktop.NetworkManager.Device.Wireless',
      member: 'AccessPointRemoved',
      signature: 'o',
      body: [
        new OBJECT_PATH(this.objectPath())
      ]
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
        d.objectPath = objpath
      })
      callback(null, d)
    })
  }

  listen(m) {

  }

  mounted() {
    
  }

  logout() {

  }
}

module.exports = AccessPoints