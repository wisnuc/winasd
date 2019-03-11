const path = require('path')

const DBus = require('./lib/dbus')
const { DBusObject } = require('./lib/dbus-object')
const {
  LITTLE, BIG,
  BYTE, BOOLEAN, INT16, UINT16, INT32, UINT32, INT64, UINT64, DOUBLE, UNIX_FD,
  STRING, OBJECT_PATH, SIGNATURE,
  STRUCT, ARRAY, VARIANT, DICT_ENTRY
} = require('./lib/dbus-types')


const DBusProperties = require('./lib/dbus-properties')
const DBusObjectManager = require('./lib/dbus-object-manager')
const LEAdvertisement1 = require('./bluez/le-advertisement1')
const GattService1 = require('./bluez/gatt-service1')
const GattDescriptor1 = require('./bluez/gatt-descriptor1')
const GattCharacteristic1 = require('./bluez/gatt-characteristic1')

const GattSerialService = require('./bluez/serives/gatt-serial-service')

const dbus = new DBus()

dbus.on('connect', () => {
  dbus.watch({ sender: 'org.bluez', path: '/org/bluez' }, err => {
    if (err) {
      console.log('failed to listen bluez')
    } else {
      console.log('listening to bluez')
    }
  })
  
  // let advpath = '/org/bluez/LEAdvertisement1/adv0'
  let advObj = dbus.createDBusObject()
    .addInterface(new DBusProperties())
    .addInterface(new DBusObjectManager())
    .addInterface(new LEAdvertisement1({
      Type: 'peripheral',
      LocalName: 'a-better-tomorrow',
      ServiceUUIDs: ['180D', '180F'],
      ManufacturerData: [
        [0xffff, ['ay', [0x55, 0x33, 0x55, 0x55]]]
      ],
      IncludeTxPower: true
    }))
    // .attach('/org/bluez/LEAdvertisement1/advertisement0')

  dbus.attach('/org/bluez/LEAdvertisement1/advertisement0', advObj)
  dbus.driver.invoke({
    destination: 'org.bluez',
    path: '/org/bluez/hci0',
    'interface': 'org.bluez.LEAdvertisingManager1',
    member: 'RegisterAdvertisement',
    signature: 'oa{sv}',
    body: [
      new OBJECT_PATH(advObj.objectPath()),
      new ARRAY('a{sv}')
    ]
  })
  return

  /**
-> /com/example
  |   - org.freedesktop.DBus.ObjectManager
  |
  -> /com/example/service0
  | |   - org.freedesktop.DBus.Properties
  | |   - org.bluez.GattService1
  | |
  | -> /com/example/service0/char0
  | |     - org.freedesktop.DBus.Properties
  | |     - org.bluez.GattCharacteristic1
  | |
  | -> /com/example/service0/char1
  |   |   - org.freedesktop.DBus.Properties
  |   |   - org.bluez.GattCharacteristic1
  |   |
  |   -> /com/example/service0/char1/desc0
  |       - org.freedesktop.DBus.Properties
  |       - org.bluez.GattDescriptor1
  |
  -> /com/example/service1
    |   - org.freedesktop.DBus.Properties
    |   - org.bluez.GattService1
    |
    -> /com/example/service1/char0
        - org.freedesktop.DBus.Properties
        - org.bluez.GattCharacteristic1
*/

  let gatt = dbus.createDBusObject()
    .addInterface(new DBusObjectManager())
    .attach('/org/bluez/GattService1')

  let s0 = dbus.createDBusObject('service0')
    .addInterface(new DBusProperties())
    .addInterface(new (GattService1(Object))({
      UUID: '0000180d-0000-1000-8000-00805f9b34fc',
      Primary: true,
    }))
    .addChild(dbus.createDBusObject('char0')
      .addInterface(new DBusProperties())
      .addInterface(new GattCharacteristic1({
        UUID: '00002a37-0000-1000-8000-00805f9b34fc',
        Flags: ['indicate'],
      })))
    .addChild(dbus.createDBusObject('char1')
      .addInterface(new DBusProperties())
      .addInterface(new GattCharacteristic1({
        UUID: '00002a38-0000-1000-8000-00805f9b34fc',
        Flags: ['read'],
      })))
    .addChild(dbus.createDBusObject('char2')
      .addInterface(new DBusProperties())
      .addInterface(new GattCharacteristic1({
        UUID: '00002a39-0000-1000-8000-00805f9b34fc',
        Flags: ['write'],
      })))
  
  gatt.addChild(s0)

  // console.dir(dbus.root, { depth: 200 })

  dbus.driver.invoke({
    destination: 'org.bluez',
    path: '/org/bluez/hci0',
    'interface': 'org.bluez.GattManager1',
    member: 'RegisterApplication',
    signature: 'oa{sv}',
    body: [
      new OBJECT_PATH(gatt.objectPath()),
      new ARRAY('a{sv}')
    ]
  }, (err, data) => {
    console.log('register application', err, data)
  })  
})
