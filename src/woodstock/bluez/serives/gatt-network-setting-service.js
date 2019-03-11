const EventEmitter = require('events')

const debug = require('debug')('gatt-netsetting')

const DBusObject = require('../../lib/dbus-object')
const DBusProperties = require('../../lib/dbus-properties')
const DBusObjectManager = require('../../lib/dbus-object-manager')
const ReadNotifyChar = require('../gatt-read-notify-char')
const WriteReadChar = require('../gatt-write-read-char')
const { OBJECT_PATH, ARRAY } = require('../../lib/dbus-types')

const DBusInterfaceDefinition = require('../lib/dbus-interface-definition')
const parseXml = require('../lib/parse-xml')

// Device is a client-specific property
// Includes not implemented according to bluez doc
const xml = `\
<interface name="org.bluez.GattService1">
  <property name="UUID" type="s" />
  <property name="Primary" type="b" />
  <property name="Device" type="o" />
  <property name="Characteristics" type="ao" />
  <property name="Includes" type="ao" />
</interface>
`

const definition = new DBusInterfaceDefinition(parseXml(xml).interface)

class GattService1 extends EventEmitter {
  constructor (props) {
    super()
    this.UUID = props.UUID
    this.Primary = !!props.Primary
    Object.defineProperty(GattService1.prototype, 'Characteristics', {
      get () {
        let name = 'org.bluez.GattCharacteristic1'
        return this.dobj.children
          .filter(obj => obj.ifaces.find(iface => iface.name === name))
          .reduce((a, c) => [...a, c.objectPath()], [])
      }
    })
  }
}

GattService1.prototype.definition = definition
GattService1.prototype.name = definition.name

class GattNetworkSettingService extends DBusObject {

  constructor (name, primary) {
    super (name)
    this.sessionId = 0
    this.started = false
    this.pending = false
    this.incoming = ''
    this.outgoing = ''

    this.addInterface(new DBusProperties())
    this.addInterface(new DBusObjectManager())
    this.addInterface(new GattService1({
      UUID: '70000000-0182-406c-9221-0a6680bd0943',
      Primary: !!primary
    }))

    this.rxIface = new ReadNotifyChar({ 
      UUID: '70000001-0182-406c-9221-0a6680bd0943',
      indicate: true
    })

    this.rxObj = new DBusObject('char0')
      .addInterface(new DBusProperties())
      .addInterface(this.rxIface)

    this.addChild(this.rxObj)

    this.txIface = new WriteReadChar({
      UUID: '70000002-0182-406c-9221-0a6680bd0943',
      readable: true
    })

    this.txIface.on('WriteValue', (...args) => this.emit('WriteValue', ...args))

    this.txObj = new DBusObject('char1')
      .addInterface(new DBusProperties())
      .addInterface(this.txIface)

    this.addChild(this.txObj)

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

module.exports = GattNetworkSettingService