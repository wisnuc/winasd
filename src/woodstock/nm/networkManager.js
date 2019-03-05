const DBusObject = require('../lib/dbus-object')
const DBusProperties = require('../lib/dbus-properties')
const DBusObjectManager = require('../lib/dbus-object-manager')
const debug = require('debug')('ws:nm')
const {
  STRING, OBJECT_PATH, ARRAY
} = require('../lib/dbus-types')

class NetworkManager extends DBusObject {
  constructor(name) {
    super(name)
    this.addInterface(new DBusProperties())
    this.addInterface(new DBusObjectManager())
    this.listener = this.listen.bind(this)
  }

  start() {
    this.getDeviceByIpIface('wlan0')
    this.requestScan()
  }

  listen(m) {
    console.log('NetworkManager', m)
  }

  handleSignal(m) {
    if (m && m.path === '/org/freedesktop/NetworkManager/Devices/2' && m.member.startsWith('AccessPoint')) {
      console.log('handleSignal', m)
      this.getAccessPoints((err, data) => console.log(err, data))
    }
  }

  registerSignals() {
    this.dbus.driver.on('signal',  m => this.handleSignal(m))
    this.dbus.driver.signal({
      path: '/org/freedesktop/NetworkManager/Devices/2',
      interface: 'org.freedesktop.NetworkManager.Device.Wireless',
      member: 'AccessPointAdded',
      signature: 'o',
      body: [
        new OBJECT_PATH(this.objectPath())
      ]
    })

    this.dbus.driver.signal({
      path: '/org/freedesktop/NetworkManager/Devices/2',
      interface: 'org.freedesktop.NetworkManager.Device.Wireless',
      member: 'AccessPointRemoved',
      signature: 'o',
      body: [
        new OBJECT_PATH(this.objectPath())
      ]
    })
  }

  mounted() {
    super.mounted()
    this.dbus.listen({
      sender: 'org.freedesktop.NetworkManager',
      path: '/org/freedesktop/NetworkManager'
    }, this.listener)
    this.registerSignals()
    this.start()
  }

  getDeviceByIpIface(iface) {
    this.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: '/org/freedesktop/NetworkManager',
      'interface': 'org.freedesktop.NetworkManager',
      member: 'GetDeviceByIpIface',
      signature: 's',
      body: [
        new STRING(iface)
      ]
    }, (err, data) => {
      console.log(err, data)
    })
  }

  //  dbus-send --system --dest=org.freedesktop.NetworkManager --print-reply /org/freedesktop/NetworkManager/Devices/2 \
  //  org.freedesktop.DBus.Properties.Get string:org.freedesktop.NetworkManager.Device.Wireless string:AccessPoints
  getAccessPoints(callback) {
    this.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: '/org/freedesktop/NetworkManager/Devices/2',
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
        let count = elems.length
        let aps = []
        if (count) {
          elems.forEach(x => {
            this.getAccessPointAllProperties(x.value, (err, data) => {
              if (data) aps.push(data)
              if (!--count) {
                return callback(null, aps)
              }
            })
          })
        } else {
          callback(null, [])
        }
      } else 
        callback(null, [])
    })
  }

  getAccessPointAllProperties(objpath, callback) {
    this.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: objpath,
      'interface': 'org.freedesktop.DBus.Properties',
      member: 'GetAll',
      signature: 's',
      body: [
        new STRING('org.freedesktop.NetworkManager.AccessPoint')
      ]
    }, (err, data) => {
      if (err) return callback(err)
      callback(data)
    })
  }

  requestScan(path) {
    this.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: '/org/freedesktop/NetworkManager/Devices/2',
      'interface': 'org.freedesktop.NetworkManager.Device.Wireless',
      member: 'RequestScan',
      signature: 'a{sv}',
      body: [
        new ARRAY('a{sv}')
      ]
    }, (err, data) => {
      console.log(err, data)
    })
  }
}

module.exports = NetworkManager

