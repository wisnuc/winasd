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

const createSignature = (ecc, op, callback) => {
  let sign = () => {
    let raw = JSON.stringify({
      lifecycle: fs.readFileSync(path.join(storageConf.dirs.device, lifecycle)).toString().trim(),
      op
    })
    if (Config.system.withoutEcc) {
      let signature
      try {
        let sign = crypto.createSign('SHA256')
        sign.write(raw)
        sign.end()
        signature = sign.sign(fs.readFileSync(path.join(certFolder, pkeyName)), 'hex')
        return callback(null, { signature, raw })
      } catch(e) {
        return callback(e)
      }
    } else {
      ecc.sign({ data:raw, der:true }, (err, sig) => {
        if (err) return callback(err)
        callback(null, { signature: sig.toString('hex'), raw })
      })
    }
  }

  if (!fs.existsSync(path.join(storageConf.dirs.device, lifecycle))) { // firstTime
    refresh(err => {
      console.log(err)
      sign()
    })
  } else {
    sign()
  }
}

module.exports.createSignature = createSignature

module.exports.reqUnbind = (ecc, encrypted, token, callback) => {
  createSignature(ecc, 'unbind', (err, { signature, raw }) => {
    if (err) return callback(err)
    request.post(`${ Config.pipe.baseURL }/s/v1/station/unbind`)
      .send({ signature, encrypted, raw })
      .set('Authorization', token)
      .then(res => {
        callback(null, res.body)
      }, error => {
        callback(error)
      })
  })
}

module.exports.reqBind = (ecc, encrypted, token, callback) => {
  createSignature(ecc, 'bind', (err, { signature, raw }) => {
    if (err) return callback(err)
    request.post(`${ Config.pipe.baseURL }/s/v1/station/bind`)
      .send({ signature, encrypted, raw })
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

const refresh = (callback) => {
  let tmp = path.join(tmpDir, UUID.v4())
  fs.writeFile(tmp, UUID.v4(), err => {
    if (err) return callback(err)
    fs.rename(tmp, path.join(storageConf.dirs.device, lifecycle), callback)
  })
}

module.exports.refresh = refresh