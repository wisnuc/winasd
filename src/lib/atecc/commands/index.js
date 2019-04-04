module.exports = Object.assign({},
  require('./exec'),
  require('./read'),
  require('./write'),
  require('./genkey'),
  require('./info'),
  require('./lock'),
  require('./nonce'),
  require('./random'),
  require('./sign'),
  require('./verify')
)
