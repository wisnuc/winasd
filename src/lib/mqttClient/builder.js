const TLS = require('./tls')
function buildBuilder(mqttClient, opts) {
  var connection;

  connection = new TLS(opts);

  function handleTLSerrors(err) {
     console.log('telsa emit error: ', err.message)
     mqttClient.emit('error', err);
     connection.end();
  }

  connection.on('connect', function() {
   //   console.log('telsa connected!')
  });

  connection.on('error', handleTLSerrors);
  connection.connect(opts.port || 8883, opts.host)
  return connection;
}

module.exports = buildBuilder;