const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const Config = require('config')
const request = require('superagent')

const storageConf = Config.get('storage')
const certFolder = storageConf.dirs.certDir
const pkeyName = 'device.key'

module.exports = (encrypted, token, callback) => {
  let signature
  try {
    let sign = crypto.createSign('SHA256')
    sign.write(req.body.encrypted)
    sign.end()
    signature = sign.sign(fs.readFileSync(path.join(certFolder, pkeyName)), 'hex')
  } catch(e) {
    return callback(e)
  }

  request.post('https://abel.nodetribe.com/s/v1/station/bind')
    .send({ signature, encrypted })
    .set('Authorization', token)
    .then(res => {
      callback(null, res.body)
    }, error => {
      callback(error)
    })
}