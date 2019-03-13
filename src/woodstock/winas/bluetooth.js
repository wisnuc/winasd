const DBusObject = require('../lib/dbus-object')
const DBusProperties = require('../lib/dbus-properties')
const DBusObjectManager = require('../lib/dbus-object-manager')
const Advertisement = require('../bluez/advertisement')
const GattSerialService = require('../bluez/serives/gatt-serial-service')
const GattLocalAuthService = require('../bluez/serives/gatt-local-auth-service')
const GattNetworkSettingService = require('../bluez/serives/gatt-network-setting-service')

/**
 * events
 * BLE_DEVICE_DISCONNECTED
 * BLE_DEVICE_CONNECTED
 */
class Bluetooth extends DBusObject {
  constructor(name) {
    super(name)
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

    this.addChild(adv)

    //600 LocalAuth
    let service1 = new GattLocalAuthService('service1', true)
    service1.on('WriteValue', (...args) => this.emit('Service1Write', ...args))
    this.Service1Update = service1.rxIface.update.bind(service1.rxIface)

    // 700 NetworkSetting
    let service2 = new GattNetworkSettingService('service2', true)
    service2.on('WriteValue', (...args) => this.emit('Service2Write', ...args))
    this.Service2Update = service2.rxIface.update.bind(service2.rxIface)

    // 800 Cloud
    let service3 = new GattSerialService('service3', true)
    service3.on('WriteValue', (...args) => this.emit('Service3Write', ...args))
    this.Service3Update = service3.rxIface.update.bind(service3.rxIface)

    // gatt root
    let gatt = new DBusObject('gatt')
      .addInterface(new DBusObjectManager())
      .addChild(service1)

    let gatt1 = new DBusObject('gatt1')
      .addInterface(new DBusObjectManager())
      .addChild(service2)

    let gatt2 = new DBusObject('gatt2')
      .addInterface(new DBusObjectManager())
      .addChild(service3)

    this
      .addChild(gatt)
      .addChild(gatt1)
      .addChild(gatt2)
  }

  mounted() {
    super.mounted()
    this.dbus.listen({
      sender: 'org.bluez',
      path: '/org/bluez/hci0'
    }, this.listen.bind(this))
  }

  listen(m) {
    // device add / remove
    if (m.path.startsWith('/org/bluez/hci0/') && m.interface === 'org.bluez.Device1') {
      if (mess.changed && mess.changed.hasOwnProperty('ServicesResolved')) {
        console.log(mess.changed.ServicesResolved ? 'BLE_DEVICE_CONNECTED' : 'BLE_DEVICE_DISCONNECTED')
        this.emit(mess.changed.ServicesResolved ? 'BLE_DEVICE_CONNECTED' : 'BLE_DEVICE_DISCONNECTED')
      }
    }
  }
}

module.exports = Bluetooth