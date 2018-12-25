const EventEmitter = require('events')
const xml2js = require('xml2js')
const DBusInterfaceDefinition = require('./dbus-interface-definition')

const parseXml = xml => {
  let r
  xml2js.parseString(xml, (err, _r) => {
    if (err) throw err
    r = _r
  })
  return r
}

const DBusInterface = (xml, Base = EventEmitter) => {
  class DBusInterface extends Base {
    constructor (props) {
      super()
      Object.assign(this, props)
    }
  }

  let definition = new DBusInterfaceDefinition(parseXml(xml).interface)
  DBusInterface.prototype.definition = definition
  DBusInterface.prototype.name = definition.name
  return DBusInterface
}

module.exports = DBusInterface
