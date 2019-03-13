const EventEmitter = require('events')
const net = require('net')

const debug = require('debug')('dbus-driver')

/**
an example error
{ type: 'ERROR',
  flags: { noReply: true },
  version: 1,
  serial: 3,
  destination: ':1.258',
  errorName: 'org.freedesktop.DBus.Error.UnknownInterface',
  replySerial: 2,
  signature: 's',
  sender: 'org.freedesktop.DBus',
  body:
   [ STRING {
       value:
        'org.freedesktop.DBus does not understand message GetManagedObjects' } ] }

*/

const {
  LITTLE, BIG,
  BYTE, BOOLEAN, INT16, UINT16, INT32, UINT32, INT64, UINT64, DOUBLE, UNIX_FD,
  STRING, OBJECT_PATH, SIGNATURE,
  STRUCT, ARRAY, VARIANT, DICT_ENTRY
} = require('./dbus-types')

const print = buf => {
  while (buf.length) {
    console.log(buf.slice(0, 16))
    buf = buf.slice(16)
  }
}

/**
Header (yyyyuua(yv))

0       BYTE  endianness 'l' for little and 'B' for BIG
1       BYTE  message type
              0   INVALID
              1   METHOD_CALL
              2   METHOD_RETURN
              3   ERROR
              4   SIGNAL
2       BYTE  flags
              0x01  NO_REPLY_EXPECTED
              0x02  NO_AUTO_START
              0x04  ALLOW_INTERACTIVE_AUTHORIZATION
3       BYTE  protocol version
4       UINT32  body length
8       UINT32  message serial
12      ARRAY of STRUCT of (BYTE, VARIANT)
                                                  Required
              0   INVALID
              1   PATH          OBJECT_PATH       METHOD_CALL, SIGNAL
              2   INTERFACE     STRING            SIGNAL
              3   MEMBER        STRING            METHOD_CALL, SIGNAL
              4   ERROR_NAME    STRING            ERROR
              5   REPLY_SERIAL  UINT32            ERROR, METHOD_RETURN
              6   DESTINATION   STRING            optional
              7   SENDER        STRING            optional
              8   SIGNATURE     SIGNATURE (body)  optional
              9   UNIX_FDS      UINT32            optional
*/

class DBusDriver extends EventEmitter {
  constructor (socket) {
    super()
    // interface name -> interface description
    this.itfDescMap = new Map()
    // object path -> dbus object
    this.objMap = new Map()

    // call serial -> callback
    this.callMap = new Map()

    this.myName = ''
    this.serial = 1
    this.data = Buffer.alloc(0)
    this.socket = null

    this.auth = false
    this.helloDone = false
    this.connect((err, socket) => {})
  }

  connect (callback) {
    const socket = net.createConnection('/run/dbus/system_bus_socket')
    const handleError = err => {
      socket.removeAllListeners()
      socket.on('error', () => {})
      socket.end()
      if (err) {
        callback(err)
      } else {
        callback(new Error('socket closed unexpectedly'))
      }
    }

    let count = 0
    let auth = false

    socket.on('error', handleError)
    socket.on('close', handleError)
    socket.on('data', data => {
      if (!auth) {
        let s = data.toString().trim()
        if (/^OK\s[a-f0-9]{32}$/.test(s)) {
          this.auth = true
          socket.write(`BEGIN\r\n`)  
          this.socket = socket
          auth = true
          
          this.invoke({
            destination: 'org.freedesktop.DBus', 
            path: '/org/freedesktop/DBus',
            interface: 'org.freedesktop.DBus',
            member: 'Hello',
          }, (err, body) => {
            if (err) {
              // TODO
            } else {
              this.myName = body[0].value
              process.nextTick(() => this.emit('connect'))
            }
          })
        } else {
          // TODO
          handleError(new Error(`handshake failed with message "${s}"`))
        }
      } else {
        this.data = Buffer.concat([this.data, data])
        this.unwire()
      }
    })

    let uid = process.getuid()
    let hex = Buffer.from(uid.toString()).toString('hex')
    socket.write(`\0AUTH EXTERNAL ${hex}\r\n`)
  }

  encodeType (type) {
    if (type === 'METHOD_CALL') {
      return 1
    } else if (type === 'METHOD_RETURN') {
      return 2
    } else if (type === 'ERROR') {
      return 3
    } else if (type === 'SIGNAL') {
      return 4
    } else {
      throw new Error(`invalid message type "${type}"`)
    }
  }

  decodeType (code) {
    switch (code) {
      case 0:
        return 'INVALID'
      case 1:
        return 'METHOD_CALL'
      case 2:
        return 'METHOD_RETURN'
      case 3:
        return 'ERROR'
      case 4:
        return 'SIGNAL'
      default:
        throw new Error(`invalid message type code "${code}"`)
    }
  }

  encodeFlags (flags) {
    let x = 0
    if (flags) {
      if (flags.noReply) x |= 0x01
      if (flags.noAutoStart) x |= 0x02
      if (flags.interactiveAuth) x |= 0x04
    }
    return x
  }

  decodeFlags (code) {
    let flags = {}
    if (code & 0x01) flags.noReply = true
    if (code & 0x02) flags.noAutoStart = true
    if (code & 0x04) flags.interactiveAuth = true
    return flags
  }

  encodeField (key, value, ValueType) {
    return new STRUCT([new BYTE(key), new VARIANT(new ValueType(value))], '(yv)')
  }

  /*
  # endian
  type ??
  flags
  # version
  # body length
  # serial

  path
  interface
  member
  errorName
  replaySerial
  destination
  # sender
  signature
  unixFds

  body
  */
  wire (m, serial) {
    let headerBuf = Buffer.alloc(1024 * 1024)
    let headerLength = 0
    let bodyBuf = Buffer.alloc(1024 * 1024)
    let bodyLength = 0
    let header = new STRUCT('(yyyyuua(yv))')
    let fields = new ARRAY('a(yv)')
    let bodyWrap, bodyWrapSig

    header.push(new BYTE(LITTLE))
    header.push(new BYTE(this.encodeType(m.type)))
    header.push(new BYTE(this.encodeFlags(m.flags)))
    header.push(new BYTE(0x01))
    if (m.body) {
      bodyWrap = new STRUCT(m.body)
      bodyWrapSig = bodyWrap.signature()
      bodyLength = bodyWrap.marshal(bodyBuf, 0, LITTLE)
    }
    header.push(new UINT32(bodyLength))
    header.push(new UINT32(serial))
    if (m.path) fields.push(this.encodeField(1, m.path, OBJECT_PATH))
    if (m.interface) fields.push(this.encodeField(2, m.interface, STRING))
    if (m.member) fields.push(this.encodeField(3, m.member, STRING))
    if (m.errorName) fields.push(this.encodeField(4, m.errorName, STRING))
    if (m.replySerial) fields.push(this.encodeField(5, m.replySerial, UINT32))
    if (m.destination) fields.push(this.encodeField(6, m.destination, STRING))
    if (this.myName) fields.push(this.encodeField(7, this.myName, STRING))
    let sig = m.signature || bodyWrap && bodyWrapSig.slice(1, bodyWrapSig.length - 1)

    if (sig) fields.push(this.encodeField(8, sig, SIGNATURE))
    if (m.unixFds) fields.push(this.encodeField(9, m.unixFds, UINT32))
    header.push(fields)
    headerLength = header.marshal(headerBuf, 0, LITTLE)

    return Buffer.concat([
      headerBuf.slice(0, Math.ceil(headerLength / 8) * 8),
      bodyBuf.slice(0, bodyLength)
    ])
  }

  send (m) {
    let serial = this.serial++
    let wired = this.wire(m, serial)
    this.socket.write(this.wire(m, serial))
    if (m.debug) {
      console.log(m)
      print(wired)
    }
    return serial
  }

  invoke (m, callback = () => {}) {
    let serial = this.send(Object.assign({}, m, { type: 'METHOD_CALL' }))
    this.callMap.set(serial, callback)
  }

  reply (m) {
    this.send(Object.assign({}, m, { type: 'METHOD_RETURN' }))
  }

  error (m) {
    this.send(Object.assign({}, m, { type: 'ERROR' }))
  }

  signal (m) {
    this.send(Object.assign({}, m, { type: 'SIGNAL' }))
  }

  unwire () {
    while (true) {
      if (this.data.length < 16) return

      let le
      if (this.data[0] === LITTLE) {
        le = true
      } else if (this.data[0] === BIG) {
        le = false
      } else {
        throw new Error('bad endianness')
      }

      let fieldsLen = le ? this.data.readUInt32LE(12) : this.data.readUInt32BE(12)
      let headerLen = 16 + fieldsLen
      let bodyLen = le ? this.data.readUInt32LE(4) : this.data.readUInt32BE(4)
      let totalLen = Math.ceil(headerLen / 8) * 8 + bodyLen
      if (this.data.length < totalLen) return

      // slice data
      let total = this.data.slice(0, totalLen)
      this.data = this.data.slice(totalLen)

      // unmarshal header
      let header = new STRUCT('(yyyyuua(yv))')
      let offset = header.unmarshal(total.slice(0, headerLen), 0, le)
      if (offset !== headerLen) {
        throw new Error('offset mismatch when unmarshalling header')
      }
      if (bodyLen !== header.elems[4].value) {
        throw new Error('body length mismatch when unmarshalling header')
      }

      let m = {}
      m.type = this.decodeType(header.elems[1].value)
      m.flags = this.decodeFlags(header.elems[2].value)
      m.version = header.elems[3].value
      m.serial = header.elems[5].value

      header.elems[6].elems.forEach(yv => {
        let y = yv.elems[0].value
        let v = yv.elems[1].elems[1].value
        let names = ['invalid', 'path', 'interface', 'member', 'errorName',
          'replySerial', 'destination', 'sender', 'signature', 'unixFds']
        if (y > 0 && y < 10) m[names[y]] = v
      })

      // signature and body must be consistent
      if (m.signature) {
        if (bodyLen === 0) {
          throw new Error('zero body length and non-empty signature')
        } else {
          let s = new STRUCT(`(${m.signature})`)
          offset = s.unmarshal(total, Math.ceil(offset / 8) * 8, le)
          if (offset !== total.length) {
            throw new Error('offset mismatch when unmarshalling body')
          } else {
            m.body = s.elems
          }
        }
      } else {
        if (bodyLen !== 0) {
          throw new Error('non-zero body length and empty signature')
        }
      }

      this.handleMessage(m)
    }
  }

  handleMessage (m) {
    if (m.type === 'METHOD_CALL') {
      this.emit('invocation', m)
    } else if (m.type === 'METHOD_RETURN' || m.type === 'ERROR') {
      let cb = this.callMap.get(m.replySerial)
      if (cb) {
        this.callMap.delete(m.replySerial)
        if (m.type === 'METHOD_RETURN') {
          cb(null, m.body)
        } else {
          let msg = 'dbus error'
          if (m.body && m.body[0] instanceof STRING) {
            msg = m.body[0].value
          }
          let err = new Error(msg)
          err.code = 'EDBUS'
          err.name = m.errorName
          cb(err)
        }
      }
    } else if (m.type === 'SIGNAL') {

//      console.log(m)

      if (m.path === '/org/freedesktop/DBus' &&
        m.interface === 'org.freedesktop.DBus' &&
        m.sender === 'org.freedesktop.DBus' &&
        m.member === 'NameAcquired' &&
        Array.isArray(m.body) &&
        m.body[0] instanceof STRING &&
        m.body[0].value.length) {
        this.myName = m.body[0].value
      } else {
        this.emit('signal', m)
      }
    }
  }
}

module.exports = DBusDriver
