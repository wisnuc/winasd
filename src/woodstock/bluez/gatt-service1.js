const EventEmitter = require('events')

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

module.exports = () => {
  const definition = new DBusInterfaceDefinition(parseXml(xml).interface)

  class GattService1 extends EventEmitter {
    constructor(props) {
      super()
      this.UUID = props.UUID
      this.Primary = !!props.Primary
      Object.defineProperty(GattService1.prototype, 'Characteristics', {
        get() {
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
  return GattService1
}
