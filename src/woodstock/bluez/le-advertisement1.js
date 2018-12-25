const DBusInterface = require('../lib/dbus-interface')

const xml = `\
<interface name = "org.bluez.LEAdvertisement1">
  <method name="Release" />
  <property name="Type" type="s" direction="read" />
  <property name="ServiceUUIDs" type="as" direction="read" />
  <property name="ManufacturerData" type="a{qv}" direction="read" />
  <property name="SolicitUUIDs" type="as" direction="read" />
  <property name="ServiceData" type="a{sv}" direction="read" />
  <property name="LocalName" type="s" direction="read" />
  <property name="IncludeTxPower" type="b" direction="read" />
</interface>
`

module.exports = DBusInterface(xml)
