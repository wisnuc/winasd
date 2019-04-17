const DBusObject = require('../lib/dbus-object')
const DBusProperties = require('../lib/dbus-properties')
const DBusObjectManager = require('../lib/dbus-object-manager')
const LEAdvertisement1 = require('./le-advertisement1')

const { OBJECT_PATH, ARRAY } = require('../lib/dbus-types')

class Advertisement extends DBusObject {
  constructor (name, props) {
    super(name)
    this.addInterface(new DBusProperties())
    this.addInterface(new DBusObjectManager())
    this.le = new LEAdvertisement1(props)
    this.addInterface(this.le)
    this.listener = this.listen.bind(this)
  }

  mounted () {
    super.mounted()
    this.dbus.listen({ sender: 'org.bluez', path: '/org/bluez' }, this.listener)
    this.register()
  }

  register () {
    // console.log('register advertisement')

    this.dbus.driver.invoke({
      destination: 'org.bluez',
      path: '/org/bluez/hci0',
      'interface': 'org.bluez.LEAdvertisingManager1',
      member: 'UnregisterAdvertisement',
      signature: 'o',
      body: [
        new OBJECT_PATH(this.objectPath()),
      ]
    }, (err, data) => {
      this.dbus.driver.invoke({
        destination: 'org.bluez',
        path: '/org/bluez/hci0',
        'interface': 'org.bluez.LEAdvertisingManager1',
        member: 'RegisterAdvertisement',
        signature: 'oa{sv}',
        body: [
          new OBJECT_PATH(this.objectPath()),
          new ARRAY('a{sv}')
        ]
      }, err => {
        console.log(err)
      })
    })
  }

  updateAdv(props) {
    let le = new LEAdvertisement1(props)
    this.removeInterface(this.le)
    this.le = le
    this.addInterface(this.le)
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

module.exports = Advertisement
