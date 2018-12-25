const EventEmitter = require('events')
const GattCharacteristic1 = require('./gatt-characteristic1')
const { ARRAY } = require('../lib/dbus-types')

/**
This class provides a gatt characteristic with write capability.
This class emit WriteValue event, along with options { device, link }

offset is not supported 
*/
class WriteCharacteristic extends GattCharacteristic1(EventEmitter) {

  /**
  @param {string} opts.UUID
  @param {boolean} opts.readable - if true, write value is cached and can be read.
  */
  constructor (opts) {
    if (!opts.UUID) throw new Error('invalid opts.UUID')
    super()

    this.UUID = opts.UUID
    if (opts.readable) {
      this.Flags = ['read', 'write']
      this.cache = null
      this.ReadValue = this.readValue.bind(this)
    } else {
      this.Flags = ['write']
    }
  }

  // convert TYPE opt to JS object
  parse (opt) {
    return opt.eval().reduce((o, [name, kv]) => Object.assign(o, { [name]: kv[1] }), {})
  }

  readValue (opt, callback) {
    opt = this.parse(opt)
    if (this.cache) {
      if (this.cache.opt.device === opt.device) {
        return callback(null, this.cache.val)
      } else {
        this.cache = null
      }
    }
    callback(null, new ARRAY('ay'))
  }

  WriteValue (val, opt, callback) {
    opt = this.parse(opt)
    this.cache = { val, opt }
    callback && callback() // reply first
    this.emit('WriteValue', Buffer.from(val.eval()), opt)
  }
}

module.exports = WriteCharacteristic
