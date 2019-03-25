const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const Config = require('config')
const request = require('superagent')
const UUID = require('uuid')

const storageConf = Config.get('storage')
const certFolder = storageConf.dirs.certDir
const tmpDir = storageConf.dirs.tmpDir
const lifecycle = storageConf.files.lifecycle
const pkeyName = 'device.key'

const createSignature = (op, callback) => {
  let signature
  try {
    let sign = crypto.createSign('SHA256')
    sign.write(JSON.stringify({
      lifecycle: fs.readFileSync(path.join(storageConf.dirs.device, lifecycle)).toString().trim(),
      op
    }))
    sign.end()
    signature = sign.sign(fs.readFileSync(path.join(certFolder, pkeyName)), 'hex')
    return callback(null, signature)
  } catch(e) {
    return callback(e)
  }
}

module.exports.createSignature = createSignature

module.exports.reqUnbind = (encrypted, token, callback) => {
  createSignature('unbind', (err, signature) => {
    if (err) return callback(err)
    request.post(`${ Config.pipe.baseURL }/s/v1/station/unbind`)
      .send({ signature, encrypted })
      .set('Authorization', token)
      .then(res => {
        callback(null, res.body)
      }, error => {
        callback(error)
      })
  })
}

module.exports.reqBind = (encrypted, token, callback) => {
  createSignature('bind', (err, signature) => {
    if (err) return callback(err)
    request.post(`${ Config.pipe.baseURL }/s/v1/station/bind`)
      .send({ signature, encrypted })
      .set('Authorization', token)
      .then(res => {
        callback(null, res.body)
      }, error => {
        callback(error)
      })
  })
}

module.exports.verify = (signature, callback) => {
  // TODO:
  // decode signature
  // check life cycle code
  // callback true / false
  callback(null, true)
}

module.exports.refresh = (callback) => {
  let tmp = path.join(tmpDir, UUID.v4())
  fs.writeFile(tmp, UUID.v4(), err => {
    if (err) return callback(err)
    fs.rename(tmp, path.join(storageConf.dirs.device, lifecycle), callback)
  })
}