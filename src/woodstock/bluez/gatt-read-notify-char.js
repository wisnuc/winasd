const EventEmitter = require('events')

const debug = require('debug')('gatt-read-notify')

const GattCharacteristic1 = require('./gatt-characteristic1')
const { ARRAY } = require('../lib/dbus-types')

class ReadNotifyCharacteristic extends GattCharacteristic1(EventEmitter) {
  constructor (opts) {
    if (!opts.UUID) throw new Error('invalid opts.UUID')
    super()
    this.UUID = opts.UUID
    this.Value = []
    this.Flags = ['read']
    if (opts.indicate || opts.notify) {
      if (opts.indicate) {
        this.Flags.push('indicate')
      } else {
        this.Flags.push('notify')
      }

      this.Notifying = false
      this.StartNotify = () => {
        debug('StartNotify')
        this.Notifying = true
      }

      this.StopNotify = () => {
        debug('StopNotify')
        this.Notifying = false
      }
    }
  }

  /**
  Possible options:
    "offset": uint16 offset
    "device": Object Device (Server only)
  */
  ReadValue (opts, callback) {
    opts = this.parseOpts(opts)
    let offset = opts.offset || 0
    let val = this.Value.slice(offset)
    callback(null, new ARRAY('ay', val))
  }

  // val is either an integer array or a buffer
  update (val) {
    if (Array.isArray(val) && val.every(b => Number.isInteger(b) && b >= 0 && b < 256)) {
      this.Value = val
    } else if (Buffer.isBuffer(val)) {
      this.Value = Array.from(val)
    } else {
      throw new Error('invalid value')
    }

    if (this.Notifying) {
      let iface = this.dobj.ifaces.find(iface => iface.name === 'org.freedesktop.DBus.Properties')
      if (iface) iface.PropertiesChanged(this, ['Value'])
    }
  }
}

module.exports = ReadNotifyCharacteristic
