const DBus = require('./lib/dbus')
const Bluetooth = require('./winas/bluetooth')

const dbus = new DBus()

dbus.on('connect', () => {
  let bt = Bluetooth()
  dbus.attach('/org/bluez/bluetooth', bt)
})
