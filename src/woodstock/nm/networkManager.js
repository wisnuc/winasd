const UUID = require('uuid')

const DBusObject = require('../lib/dbus-object')
const DBusProperties = require('../lib/dbus-properties')
const DBusObjectManager = require('../lib/dbus-object-manager')
const debug = require('debug')('ws:nm')
const {
  STRING, OBJECT_PATH, ARRAY, DICT_ENTRY, VARIANT, BYTE
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
  }

  handleSignal(m) {
    if (m && m.path === '/org/freedesktop/NetworkManager/Devices/2' && m.member.startsWith('AccessPoint')) {
      this.getAccessPoints((err, data) => {
        if(err) return console.log('getAccessPoints err', err)
        let air = data.find(x => x.Ssid === 'Wisnuc-Air')
        if (air && !this.lock) {
          this.lock = true
          console.log('find air:', air)
          this.AddAndActivateConnection(air.Ssid, 'wisnuc123456','/org/freedesktop/NetworkManager/Devices/2', air.objectPath, (err, data) => {
            console.log('************************')
            console.log('add success')
            console.log(err)
            console.log(data)
          })
        }
      })
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

  requestScan(path, callback) {
    this.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: '/org/freedesktop/NetworkManager/Devices/2',
      'interface': 'org.freedesktop.NetworkManager.Device.Wireless',
      member: 'RequestScan',
      signature: 'a{sv}',
      body: [
        new ARRAY('a{sv}')
      ]
    }, (err, data) => callback && callback(err, data))
  }

  AddAndActivateConnection(Ssid, pwd, device, specific_object, callback) {
    let con = new ARRAY('a{sa{sv}}')
    // connection
    let connection = new ARRAY('a{sv}')
    connection.push(new DICT_ENTRY([
      new STRING('type'),
      new VARIANT(new STRING('802-11-wireless'))
    ]))
    connection.push(new DICT_ENTRY([
      new STRING('uuid'),
      new VARIANT(new STRING(UUID.v4()))
    ]))
    connection.push(new DICT_ENTRY([
      new STRING('id'),
      new VARIANT(new STRING(Ssid))
    ]))
    // ipv4
    let ipv4 = new ARRAY('a{sv}')
    ipv4.push(new DICT_ENTRY([
      new STRING('method'),
      new VARIANT(new STRING('auto'))
    ]))
    // ipv6
    let ipv6 = new ARRAY('a{sv}')
    ipv6.push(new DICT_ENTRY([
      new STRING('method'),
      new VARIANT(new STRING('auto'))
    ]))

    //wifi
    let wifi = new ARRAY('a{sv}')
    let ssid = new ARRAY('ay')
    Array.from(Buffer.from(Ssid)).forEach(x => ssid.push(new BYTE(x)))
    wifi.push(new DICT_ENTRY([
      new STRING('mode'),
      new VARIANT(new STRING('infrastructure'))
    ]))
    wifi.push(new DICT_ENTRY([
      new STRING('ssid'),
      new VARIANT(ssid)
    ]))

    // wifi-security
    let wifiSecurity = new ARRAY('a{sv}')
    wifiSecurity.push(new DICT_ENTRY([
      new STRING('auth-alg'),
      new VARIANT(new STRING('open'))
    ]))
    wifiSecurity.push(new DICT_ENTRY([
      new STRING('key-mgmt'),
      new VARIANT(new STRING('wpa-psk'))
    ]))
    wifiSecurity.push(new DICT_ENTRY([
      new STRING('psk'),
      new VARIANT(new STRING(pwd))
    ]))

    con.push(new DICT_ENTRY([
      new STRING('connection'),
      connection
    ]))
    con.push(new DICT_ENTRY([
      new STRING('ipv4'),
      ipv4
    ]))
    con.push(new DICT_ENTRY([
      new STRING('ipv6'),
      ipv6
    ]))
    con.push(new DICT_ENTRY([
      new STRING('802-11-wireless'),
      wifi
    ]))
    con.push(new DICT_ENTRY([
      new STRING('802-11-wireless-security'),
      wifiSecurity
    ]))
    console.log(JSON.stringify(con))
    this.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: '/org/freedesktop/NetworkManager',
      'interface': 'org.freedesktop.NetworkManager',
      member: 'AddAndActivateConnection',
      signature: 'a{sa{sv}}oo',
      body:[
        con,
        new OBJECT_PATH(device),
        new OBJECT_PATH(specific_object)
      ]
    }, callback)
  }

  connect(Ssid, pwd, callback) {

  }

  getWifiList(callback) {

  }
}

module.exports = NetworkManager

