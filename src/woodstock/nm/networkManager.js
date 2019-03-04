const DBusObject = require('../lib/dbus-object')
const DBusProperties = require('../lib/dbus-properties')
const DBusObjectManager = require('../lib/dbus-object-manager')
const {
  STRING, OBJECT_PATH
} = require('../lib/dbus-types')

class NetworkManager extends DBusObject {
  constructor(name) {
    super(name)
    this.addInterface(new DBusProperties())
    this.addInterface(new DBusObjectManager())
    this.listener = this.listen.bind(this)
  }

  listen(m) {}

  mounted() {
    super.mounted()
    this.dbus.listen({
      sender: 'org.freedesktop.NetworkManager',
      path: '/org/freedesktop/NetworkManager'
    }, this.listener)
    // this.register()
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
  getAccessPoints() {
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
      console.log(err, data)
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

