const TLS = require('../telsa')
const Device = require('../device')

module.exports = (opts, callback) => {
  let connection = new TLS(opts)

  function handleTLSerrors(err) {
    connection.end()
    callback(err)
  }
  let device
  connection.on('connect', function() {
    console.log('telsa connected!')
    let builder = (mqttClient, opts) => {
      return connection.state.rp.socket
    }
    deivce = new Device(opts, builder)
    callback(null, device)
  })

  connection.on('error', handleTLSerrors)
  connection.connect(opts.port || 8883, opts.host)
}
