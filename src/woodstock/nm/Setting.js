const {
  STRING, OBJECT_PATH, ARRAY, DICT_ENTRY, VARIANT, BYTE, BOOLEAN
} = require('../lib/dbus-types')

class Setting extends require('events') {

  constructor(ctx) {
    super()
    this.ctx = ctx
    this.ctx.addSignalHandle('/org/freedesktop/NetworkManager/Settings', m => {
      if (m.member === 'ConnectionRemoved') {
        console.log('ConnectionRemoved', m)
      } else if (m.member === 'NewConnection') {
        console.log('NewConnection', m)
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
        new OBJECT_PATH('/org/freedesktop/NetworkManager/Settings')
      ]
    })

    this.ctx.dbus.driver.signal({
      path: '/org/freedesktop/NetworkManager/Settings',
      interface: 'org.freedesktop.NetworkManager.Settings',
      member: 'NewConnection',
      signature: 'o',
      body: [
        new OBJECT_PATH('/org/freedesktop/NetworkManager/Settings')
      ]
    })
  }

  listen(m) {

  }

  logout() {

  }
}

module.exports = Setting