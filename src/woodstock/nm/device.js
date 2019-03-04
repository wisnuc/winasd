const DBusInterface = require('../lib/dbus-interface')

const xml = (name) => `\
<interface name = "${name}">
  <method name="ReadValue">
    <arg name="options" direction="in" type="a{sv}" />
    <arg direction="out" type="ay" />
  </method>
</interface>
`