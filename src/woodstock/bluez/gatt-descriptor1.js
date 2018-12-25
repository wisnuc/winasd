const DBusInterface = require('../lib/dbus-interface')

const xml = `\
<interface name="org.bluez.GattDescriptor1">
  <method name="ReadValue">
    <arg direction="out" type="ay" />
  </method>
  <method name="WriteValue">
    <arg direction="in" type="ay" />
  </method>
  <property name="UUID" type="s" />
  <property name="Characteristic" type="o" />
  <property name="Value" type="ay" />
  <property name="Flags" type="as" />
</interface>
`

module.exports = DBusInterface(xml)


