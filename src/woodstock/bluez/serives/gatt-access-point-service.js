const DBusObject = require('../../lib/dbus-object')
const DBusProperties = require('../../lib/dbus-properties')
const DBusObjectManager = require('../../lib/dbus-object-manager')
const WriteNotifyChar = require('../gatt-write-indicate-char')
const { OBJECT_PATH, ARRAY } = require('../../lib/dbus-types')
const GattService = require('../gatt-service1')()

class GattAccessPointService extends DBusObject {

  constructor (name, primary) {
    super (name)

    this.addInterface(new DBusProperties())
    this.addInterface(new DBusObjectManager())
    this.addInterface(new GattService({
      UUID: '20000000-0182-406c-9221-0a6680bd0943',
      Primary: !!primary
    }))

    this.txIface1 = new WriteNotifyChar({
      UUID: '20000002-0182-406c-9221-0a6680bd0943',
      indicate: true
    })

    this.txIface1.on('WriteValue', (...args) => this.emit('Char1WriteValue', ...args))

    this.char1Update = this.txIface1.update.bind(this.txIface1)

    this.txObj1 = new DBusObject('char1')
      .addInterface(new DBusProperties())
      .addInterface(this.txIface1)

    this.addChild(this.txObj1)

    this.txIface2 = new WriteNotifyChar({
      UUID: '20000003-0182-406c-9221-0a6680bd0943',
      indicate: true
    })

    this.txIface2.on('WriteValue', (...args) => this.emit('Char2WriteValue', ...args))

    this.char2Update = this.txIface2.update.bind(this.txIface2)

    this.txObj2 = new DBusObject('char2')
      .addInterface(new DBusProperties())
      .addInterface(this.txIface2)

    this.addChild(this.txObj2)

    this.listener = this.listen.bind(this)

  }

  register () {
    this.dbus.driver.invoke({
      destination: 'org.bluez',
      path: '/org/bluez/hci0',
      'interface': 'org.bluez.GattManager1',
      member: 'UnregisterApplication',
      signature: 'o',
      body: [ new OBJECT_PATH(this.objectPath()) ]
    }, (err, data) => {
      if (err) {
        console.log('unregister application', err.code, err.message)
      } else {
        console.log('unregister application succeeded')
      }

      this.dbus.driver.invoke({
        destination: 'org.bluez',
        path: '/org/bluez/hci0',
        'interface': 'org.bluez.GattManager1',
        member: 'RegisterApplication',
        signature: 'oa{sv}',
        body: [
          new OBJECT_PATH(this.objectPath()),
          new ARRAY('a{sv}')
        ]
      }, (err, data) => {
        console.log('register application', err, data)
      }) 
    }) 
  }

  mounted () {
    super.mounted()
    this.dbus.listen({ sender: 'org.bluez', path: '/org/bluez' }, this.listener)
    this.register()
  }

  listen (m) {
    if (m.path === '/org/bluez/hci0' &&
      m.interface === 'org.bluez.Adapter1' &&
      m.changed &&
      m.changed.Powered === true) {
      this.register()
    }
  } 
}

module.exports = GattAccessPointService
