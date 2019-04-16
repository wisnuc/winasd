const {
  STRING, OBJECT_PATH, ARRAY, DICT_ENTRY, VARIANT, BYTE, BOOLEAN
} = require('../lib/dbus-types')
const UUID = require('uuid')

class Setting extends require('events') {
  constructor(ctx) {
    super()
    this.ctx = ctx
    this.ctx.addSignalHandle('/org/freedesktop/NetworkManager/Settings', m => {
      if (m.member === 'ConnectionRemoved') {
        this.ctx.emit('NM_ST_ConnectionRemoved', m.body[0].value)
        this.ctx.emit('NM_ST_ConnectionChanged')
      } else if (m.member === 'NewConnection') {
        this.ctx.emit('NM_ST_ConnectionAdded', m.body[0].value)
        this.ctx.emit('NM_ST_ConnectionChanged')
      }
    })
  }

  // 集合操作
  ListConnections(callback) {
    this.ctx.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: '/org/freedesktop/NetworkManager/Settings',
      'interface': 'org.freedesktop.NetworkManager.Settings',
      member: 'ListConnections'
    }, (err, data) => {
      console.log('ListConnections', err, data)
    })
  }

  ReloadConnections(callback) {
    this.ctx.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: '/org/freedesktop/NetworkManager/Settings',
      'interface': 'org.freedesktop.NetworkManager.Settings',
      member: 'ReloadConnections'
    }, (err, data) => callback && callback(err, data))
  }

  AddConnection (Ssid, pwd, callback) {
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
    this.ctx.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: '/org/freedesktop/NetworkManager/Settings',
      'interface': 'org.freedesktop.NetworkManager.Settings',
      member: 'AddConnection',
      signature: 'a{sa{sv}}',
      body: [
        con
      ]
    }, (err, data) => callback && callback(err, data))
  }

  // 单例操作
  /**
   * 
   * @param {*} objPath - Setting ObjectPath 
   */
  ClearSecrets(objPath, callback) {
    this.ctx.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: objPath,
      'interface': 'org.freedesktop.NetworkManager.Settings.Connection',
      member: 'ClearSecrets'
    }, (err, data) => {
      console.log('ClearSecrets', err, data)
    })
  }

  /**
   * 
   * @param {*} objPath - Setting ObjectPath 
   */
  Delete(objPath, callback) {
    this.ctx.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: objPath,
      'interface': 'org.freedesktop.NetworkManager.Settings.Connection',
      member: 'Delete'
    }, (err, data) => {
      console.log('Delete', err, data)
    })
  }

  Update() {

  }

  /**
   * 
   * @param {*} objPath - Setting ObjectPath 
   */
  GetSetting(objPath, callback) {
    this.ctx.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: objPath,
      'interface': 'org.freedesktop.NetworkManager.Settings.Connection',
      member: 'GetSetting'
    }, (err, data) => {
      console.log('GetSetting', err, data)
    })
  }
  
  mounted() {
    this.ctx.dbus.driver.signal({
      path: '/org/freedesktop/NetworkManager/Settings',
      interface: 'org.freedesktop.NetworkManager.Settings',
      member: 'ConnectionRemoved',
      signature: 'o',
      body: [
        new OBJECT_PATH('/org/freedesktop/NetworkManager')
      ]
    })

    this.ctx.dbus.driver.signal({
      path: '/org/freedesktop/NetworkManager/Settings',
      interface: 'org.freedesktop.NetworkManager.Settings',
      member: 'NewConnection',
      signature: 'o',
      body: [
        new OBJECT_PATH('/org/freedesktop/NetworkManager')
      ]
    })
  }

  listen(m) {

  }

  logout() {

  }
}

module.exports = Setting