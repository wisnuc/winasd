const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const Config = require('config')
const request = require('superagent')

const storageConf = Config.get('storage')
const certFolder = storageConf.dirs.certDir
const tmpDir = storageConf.dirs.tmpDir
const lifecycle =storageConf.files.lifecycle
const pkeyName = 'device.key'

module.exports.reqBind = (encrypted, token, callback) => {
  let signature
  try {
    let sign = crypto.createSign('SHA256')
    sign.write(encrypted)
    sign.end()
    signature = sign.sign(fs.readFileSync(path.join(certFolder, pkeyName)), 'hex')
  } catch(e) {
    return callback(e)
  }

  request.post(`${ Config.pipe.baseURL }/s/v1/station/bind`)
    .send({ signature, encrypted })
    .set('Authorization', token)
    .then(res => {
      callback(null, res.body)
    }, error => {
      callback(error)
    })
}

module.exports.reqUnbind = (callback) => {
  let signature
  try {
    let sign = crypto.createSign('SHA256')
    sign.write(fs.readFileSync(path.join(storageConf.dirs.device, lifecycle)).toString().trim())
    sign.end()
    signature = sign.sign(fs.readFileSync(path.join(certFolder, pkeyName)), 'hex')
    return callback(null, signature)
  } catch(e) {
    return callback(e)
  }
}