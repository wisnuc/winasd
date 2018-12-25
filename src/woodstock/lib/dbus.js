const path = require('path')
const EventEmitter = require('events')
const net = require('net')

const xml2js = require('xml2js')
const debug = require('debug')

const logr = debug('dbus:reply')
const logs = debug('dbus:signal')

const {
  LITTLE, BIG, TYPE,
  BYTE, BOOLEAN, INT16, UINT16, INT32, UINT32, INT64, UINT64, DOUBLE, UNIX_FD,
  STRING, OBJECT_PATH, SIGNATURE,
  STRUCT, ARRAY, VARIANT, DICT_ENTRY
} = require('./dbus-types')
const DBusDriver = require('./dbus-driver')
const DBusObject = require('./dbus-object')

const DBUS_SOCKET = '/run/dbus/system_bus_socket'

// DBus implements DBus Message Bus
class DBus extends EventEmitter {
  constructor (opts) {
    super()
    // context-specific class BAD IDEA !!!
    this.DBusObject = class extends DBusObject {}
    this.DBusObject.prototype.dbus = this

    this.driver = new DBusDriver()
    this.driver.on('connect', () => this.emit('connect'))
    this.driver.on('message', msg => {})
    this.driver.on('invocation', m => this.handleMethodCall(m))
    this.driver.on('signal', m => this.handleSignal(m))

    this.root = new this.DBusObject()
    Object.defineProperty(this.root, 'dbus', { get: () => this })

    this.listenerMap = new Map()
  }

  handleMethodCall (m) {
    let namepath = m.path.split('/').filter(x => !!x)

    // retrieve obj
    let obj = this.root.route(namepath)
    if (!obj) {
      this.driver.error({
        flags: { noReply: true },
        destination: m.sender,
        replySerial: m.serial,
        errorName: 'org.freedesktop.DBus.Error.UnknownObject'
      })
      console.log(`path ${m.path} not found, message dropped`)
      return // TODO
    }

    // retrieve interface
    let iface = obj.ifaces.find(i => i.name === m.interface)
    if (!iface) {
      this.driver.error({
        flags: { noReply: true },
        destination: m.sender,
        replySerial: m.serial,
        errorName: 'org.freedesktop.DBus.Error.UnknownInterface',
        signature: 's',
        body: [new STRING(`${m.interface} not found`)]
      })
      console.log(`${m.interface} not implement at ${m.path}`)
      return // TODO
    }

    // check interface method
    let methodName = m.member
    if (typeof iface[methodName] !== 'function') {
      return // TODO
    }

    // retrieve signature from definition
    let sigs = iface.definition.method(methodName)
    if (!sigs) {
      // no definition is disallowed
      return // TODO
    }

    let isigs = sigs.filter(s => s.direction === 'in').map(s => s.type)
    let osigs = sigs.filter(s => s.direction === 'out').map(s => s.type)

    let msig = m.signature || ''
    if (isigs.join('') !== msig) {
      // signature mismatch, client error
      return // TODO
    }

    // message body is an array of TYPE object, or undefined
    let inputs = m.body || []
    if (iface.useJsType) {
      inputs = inputs.map(arg => arg.eval())
    }

    if (methodName === 'Confirm') console.log('----', m, '----')

    // invoke method
    iface[methodName](...inputs, (err, output) => {
      if (err) {
        // TODO
      } else {
        let signature = osigs.join('')
        let rm = Object.assign({
          flags: { noReply: true },
          destination: m.sender,
          replySerial: m.serial
        }, signature && {
          signature,
          body: iface.useJsType ? [new TYPE(signature, output)] : [output]
        })

        // format 
        let $0 = `${m.interface.split('.').pop()}.${m.member}`
        let $1 = `${m.body ? '(' + m.body[0].eval() + ')' : '()'}` 
        logr(`${m.path} ${$0}${$1} =>`, rm.body && rm.body[0].eval())
        this.driver.reply(rm)
      }
    })
  }

  handleSignal (m) {
    if (m.interface === 'org.freedesktop.DBus.Properties' && m.member === 'PropertiesChanged') {
      let iface = m.body[0].eval()
      let changed = m.body[1].eval().reduce((o, [k, v]) => Object.assign(o, { [k]: v[1] }), {})
      let invalidated = m.body[2].eval()
      let o = { path: m.path, interface: iface, changed, invalidated }

      logs(o)

      for (let [k, f] of this.listenerMap) {
        let opath = o.path.split('/')
        let kpath = k.path.split('/')
        if (opath.length >= kpath.length && 
          opath.slice(0, kpath.length).every((s, i) => s === kpath[i])) {
          f(o) 
        }
      }
    }
  }

  createDBusObject (name) {
    return new this.DBusObject(name)
  }

  attach (dpath, dobj) {
    if (path.normalize(dpath) !== dpath) throw new Error('not a normalized path')
    if (!path.isAbsolute(dpath)) throw new Error('not an absolute path')

    let namepath = dpath.split('/').filter(x => !!x)
    if (this.root.route(namepath)) throw new Error('dbus object exists')

    namepath.pop()

    let pobj = this.root.route(namepath, true)
    dobj.name = path.basename(dpath)
    pobj.addChild(dobj)
    if (dobj.onAttached && typeof dobj.onAttached === 'function') {
      dobj.onAttached()
    }
  }

  watch (opts, callback) {
    let string = `type='signal',sender='${opts.sender}',path_namespace='${opts.path}'`
    this.driver.invoke({
      destination: 'org.freedesktop.DBus',
      path: '/org/freedesktop/DBus',
      'interface': 'org.freedesktop.DBus',
      member: 'AddMatch',
      signature: 's',
      body: [new STRING(string)]
    }, err => callback(err))
  }

  listen (opts, listener) {
    this.listenerMap.set(opts, listener)    
    let string = `type='signal',sender='${opts.sender}',path_namespace='${opts.path}'`
    this.driver.invoke({
      destination: 'org.freedesktop.DBus',
      path: '/org/freedesktop/DBus',
      'interface': 'org.freedesktop.DBus',
      member: 'AddMatch',
      signature: 's',
      body: [new STRING(string)]
    })
  }
}

module.exports = DBus
