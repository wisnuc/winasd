
let auth = false
let hello = false

let socket = net.createConnectoin('/run/dbus/system_bus_socket')

socket.on('error', err => console.log('error', err))
socket.on('close', () => console.log('socket closed'))

socket.on('data', data => {
  console.log(data.toString())
 
})

