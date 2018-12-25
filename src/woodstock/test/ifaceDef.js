const path = require('path')
const expect = require('chai').expect

const xml2js = require('xml2js')
const iface = require('lib/ifaceDef')    

/**
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<node>
  <interface name="org.freedesktop.DBus.Introspectable">
    <method name="Introspect">
      <arg name="xml" type="s" direction="out"/>
    </method>
  </interface>
  <interface name="org.bluez.AgentManager1">
    <method name="RegisterAgent">
      <arg name="agent" type="o" direction="in"/>
      <arg name="capability" type="s" direction="in"/>
    </method>
    <method name="UnregisterAgent">
      <arg name="agent" type="o" direction="in"/>
    </method>
    <method name="RequestDefaultAgent">
      <arg name="agent" type="o" direction="in"/>
    </method>
  </interface>
  <interface name="org.bluez.ProfileManager1">
    <method name="RegisterProfile">
      <arg name="profile" type="o" direction="in"/>
      <arg name="UUID" type="s" direction="in"/>
      <arg name="options" type="a{sv}" direction="in"/>
    </method>
    <method name="UnregisterProfile">
      <arg name="profile" type="o" direction="in"/>
    </method>
  </interface>
  <node name="hci0"/>
</node>
*/

const x = `\
<interface name="org.bluez.LEAdvertisingManager1">
  <method name="RegisterAdvertisement">
    <arg name="advertisement" type="o" direction="in"/>
    <arg name="options" type="a{sv}" direction="in"/>
  </method>
  <method name="UnregisterAdvertisement">
    <arg name="service" type="o" direction="in"/>
  </method>
  <property name="ActiveInstances" type="y" access="read"/>
  <property name="SupportedInstances" type="y" access="read"/>
  <property name="SupportedIncludes" type="as" access="read"/>
</interface>
`

describe(path.basename(__filename), () => {
  it('hello', done => {
    xml2js.parseString(x, (err, xml) => {
      console.log(xml.interface)
      done()
    })
  })
})
