const EventEmitter = require('events')
const net = require('net')

const stream = require('stream')

const crypto = require('crypto')

const message = require('./lib/message')
const constants = require('./lib/constants')

const socket = net.createConnection('/run/dbus/system_bus_socket')
socket.on('error', err => {
  console.log('error', err.stack)
})

let serial = 1
let cookies = {}

const invoke = function (msg, callback) {
  if (!msg.type) msg.type = constants.messageType.methodCall
  msg.serial = serial++
  cookies[msg.serial] = callback
  let wireMsg = message.marshall(msg)
  let digest = crypto.createHash('sha256').update(wireMsg).digest('hex')
  socket.write(wireMsg.toString('binary'))
}

socket.on('connect', () => {

  let uid = process.getuid() 
  let hex = Buffer.from(uid.toString()).toString('hex')
  console.log('hex', hex)
  socket.write(`\0AUTH EXTERNAL ${hex}\r\n`)
  socket.once('data', data => {
    let s = data.toString().trim()
    console.log(s)
    if (/^OK\s[a-f0-9]{32}$/.test(s)) {
      socket.write(`BEGIN\r\n`)
      let pt = new stream.PassThrough()
      message.unmarshalMessages(pt, msg => {
        console.log(msg)
      }, {})

      socket.pipe(pt)
      socket.on('data', data => {
        for (let buf = data; buf.length; buf = buf.slice(16)) 
          console.log(buf.slice(0, 16))
      })

      invoke({
        path:'/org/freedesktop/DBus',
        destination: 'org.freedesktop.DBus',
        'interface': 'org.freedesktop.DBus',
        member: 'Hello',
        type: 1
      }, () => {
/**
        invoke({
          path: '/
        })
*/

        
      })

      

    } else {
      // error
    }
  })

})






