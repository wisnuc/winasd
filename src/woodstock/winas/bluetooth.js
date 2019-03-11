const DBusObject = require('../lib/dbus-object')
const DBusProperties = require('../lib/dbus-properties')
const DBusObjectManager = require('../lib/dbus-object-manager')
const Advertisement = require('../bluez/advertisement')
const GattSerialService = require('../bluez/serives/gatt-serial-service')
const GattLocalAuthService = require('../bluez/serives/gatt-local-auth-service')
const GattNetworkSettingService = require('../bluez/serives/gatt-network-setting-service')

module.exports = () => {
  // name will be set when attaching this object
  let bluetooth = new DBusObject()

  let adv = new Advertisement('advertisement0', {
    Type: 'peripheral',
    LocalName: 'wisnuc',
    // ServiceUUIDs: ['180D', '180F'],
    // 1805 CTS
    // ServiceUUIDs: ['80000000-0182-406c-9221-0a6680bd0943'],
    ManufacturerData: [
      [0xffff, ['ay', [0x55, 0x33, 0x55, 0x55]]]
    ],
    IncludeTxPower: true
  })

  bluetooth.addChild(adv)

  let service0 = new GattSerialService('service0', true)
  service0.on('WriteValue', (...args) => bluetooth.emit('Service0Write', ...args))
  bluetooth.update0 = service0.rxIface.update.bind(service0.rxIface)

  let service1 = new GattLocalAuthService('service1', true)
  service1.on('WriteValue', (...args) => bluetooth.emit('Service1Write', ...args))
  bluetooth.update1 = service1.rxIface.update.bind(service1.rxIface)

  let service2 = new GattNetworkSettingService('service2', true)
  service2.on('WriteValue', (...args) => bluetooth.emit('Service2Write', ...args))
  bluetooth.update2 = service2.rxIface.update.bind(service2.rxIface)

  // gatt root
  let gatt = new DBusObject('gatt')
    .addInterface(new DBusObjectManager())
    .addChild(service0)
    .addChild(service1)
    .addChild(service2)

  bluetooth.addChild(gatt)

  return bluetooth
}
