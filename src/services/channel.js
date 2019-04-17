const Device = require('aws-iot-device-sdk').device
const fs = require('fs')
const path = require('path')
const Config = require('config')
const State = require('../lib/state')
const { networkInterface, deviceName } = require('../lib/device')
const debug = require('debug')('ws:channel')
const request = require('request')
const Client = require('../lib/mqttClient')

const storageConf = Config.get('storage')
const IOTConf = Config.get('iot')
const certFolder = storageConf.dirs.certDir
const crtName = storageConf.files.cert
const pkeyName = 'device.key'
const caName = storageConf.files.caCert

const getURL = (stationId, jobId) => `${Config.pipe.baseURL}/s/v1/station/${stationId}/response/${jobId}`

const formatError = (error, status) => {
  status = status || 403
  let formatError
  if (error instanceof Error) {
    formatError = error
    formatError.status = error.status ? error.status : status
  } else if (typeof err === 'string') {
    formatError = new Error(error)
    formatError.status = status
  }
  return formatError
}

class Base extends State {
  debug(...args) {
    debug(...args)
  }
}

class Connecting extends Base {
  enter (callback) {
    let cb = (err, connection, token, user) => {
      if (err) {
        callback && callback(err)
        return this.setState('Failed', err)
      }
      this.setState('Connected', connection, token, user)
    }
    this.ctx.withoutEcc ? this.fakeConnect(cb) : this.realConnect(cb)
  }

  fakeConnect(callback) {
    let timer, token, user, device, finished = false
    let cb = (err) => {
      clearTimeout(timer)
      if (finished) return
      finished = true
      if (device) {
         device.removeAllListeners()
         device.on('error', () =>{})
      }
      if (err) {
        device && device.end()
        device = undefined
      }
      callback(err, device, token, user)
    }

    timer = setTimeout(() => {
      device.removeAllListeners()
      device.on('error', () => {})
      device.end(true)
      device = undefined
      cb(new Error('ETIMEOUT'))
    }, 10000) // FIXME:

    device = new Device({
      keyPath: path.join(certFolder, pkeyName),
      certPath: path.join(certFolder, crtName),
      caPath: path.join(certFolder, caName),
      clientId: this.ctx.sn,
      keepalive: 5,
      host: IOTConf.endpoint,
    })

    device.on('connect', () => {
      device.subscribe(`cloud/${ this.ctx.sn }/connected`)
      device.publish(`device/${ this.ctx.sn }/info`, JSON.stringify({ 
        lanIp: networkInterface().address,
        name: deviceName()
      }))
    })
    device.on('error', cb)
    device.on('message', (topic, payload) => {
      if (topic === `cloud/${ this.ctx.sn }/connected`) {
        let msg
        try {
          msg = JSON.parse(payload.toString())
        } catch(e) {
          return cb(e)
        }
        token = msg.token
        user = msg.device
        cb()
      }
    })
    device.on('offline', () => cb(new Error('offline')))
  }

  realConnect(callback) {
    let timer, token, user, device, finished = false
    let cb = (err) => {
      clearTimeout(timer)
      if (finished) return
      finished = true
      if (device) {
         device.removeAllListeners()
         device.on('error', () =>{})
      }
      if (err) {
        device && device.end()
        device = undefined
      }
      callback(err, device, token, user)
    }

    timer = setTimeout(() => {
      device.removeAllListeners()
      device.on('error', () => {})
      device.end(true)
      device = undefined
      cb(new Error('ETIMEOUT'))
    }, 10000) // FIXME:

    device = new Client({
      clientCertificates: [
        Buffer.from(fs.readFileSync(path.join(certFolder, crtName))
          .toString()
          .split('\n')
          .filter(x => !!x && !x.startsWith('--'))
          .join(''), 'base64')
      ],
      caPath: fs.readFileSync(path.join(certFolder, caName)).toString().replace(/\r\n/g, '\n'),
      clientId: this.ctx.sn,
      host: IOTConf.endpoint,
      keepalive: 5,
      clientPrivateKey: (data, callback) =>
        this.ctx.ctx.ecc.sign({ data, der: true }, callback),
      clientCertificateVerifier: {
        algorithm: '',
        sign: ''
      }
    })

    device.on('connect', () => {
      device.subscribe(`cloud/${ this.ctx.sn }/connected`)
      device.publish(`device/${ this.ctx.sn }/info`, JSON.stringify({ 
        lanIp: networkInterface().address,
        name: deviceName()
      }))
    })
    device.on('error', cb)
    device.on('message', (topic, payload) => {
      if (topic === `cloud/${ this.ctx.sn }/connected`) {
        let msg
        try {
          msg = JSON.parse(payload.toString())
        } catch(e) {
          return cb(e)
        }
        token = msg.token
        user = msg.device
        cb()
      }
    })
    device.on('offline', () => cb(new Error('offline')))
  }

  publish(...args) {}

  subscribe(...args) {}

  connect() {}
}

class Connected extends Base {
  enter (connection, token, device) {
    this.ctx.ctx.token = token
    this.user = device.owner ? {
      id: device.owner,
      username: device.username,
      phone: device.phoneNumber
    } : null
    // this.ctx.ctx.updateOwner(this.user, () => {})
    
    this.connection = connection
    this.connection.on('message', this.ctx.handleIotMsg.bind(this.ctx))
    this.connection.on('close', () => this.setState('Failed', new Error('close')))
    this.connection.on('error', err => this.setState('Failed', err))
    this.connection.on('offline', () => this.setState('Failed', new Error('offline')))
    this.connection.subscribe(`cloud/${ this.ctx.sn }/pipe`)
    this.connection.subscribe(`cloud/${ this.ctx.sn }/users`)
    this.connection.subscribe(`cloud/${ this.ctx.sn }/token`)
    this.timer = setInterval(() => {
      this.publish(`device/${ this.ctx.sn }/token`, '') // refresh token
    }, 1000 * 60 * 60 * 24)

    this.ctx.emit('ChannelConnected', device, this.user)
  }

  publish(...args) {
    this.connection.publish(...args)
  }

  subscribe(...args) {
    this.connection.subscribe(...args)
  }

  connect() {}
  

  exit(){
    this.connection.removeAllListeners()
    this.connection.on('error', () => {})
    this.connection.end()
    this.connection = undefined
    this.ctx.ctx.token = undefined
    clearInterval(this.timer)
  }
}

class Failed extends Base {
  enter(error) {
    // console.log('Failed: ', error)
    this.error = error
    this.timer = setTimeout(() => this.setState('Connecting'), 1000 * 10)
  }

  exit() {
    clearTimeout(this.timer)
  }

  connect() {
    this.setState('Connecting')
  }

  publish() {}

  subscribe() {}
}

/***
 * Channel 负责连接AWS IoT,监听 Iot 消息
 * 连接使用telsa + ecc
 */
class Channel extends require('events') {
  constructor(ctx) {
    super()

    this.ctx = ctx

    this.withoutEcc = Config.system.withoutEcc

    this.sn = this.ctx.deviceSN

    new Connecting(this)
  }

  checkMessage (message) {
    if (!message) throw formatError(new Error('pipe have no message'), 400)

    if (!message.sessionId) {
      throw formatError(new Error(`message have no msgId`), 400)
    }
    if (!message.user || !message.user.id) {
      throw formatError(new Error(`this msgId: message have no user`), 400)
    }
    if (!message.verb) {
      throw formatError(new Error(`this msgId: data have no verb`), 400)
    }
    if (!message.urlPath) {
      throw formatError(new Error(`this msgId: data have no urlPath`), 400)
    }
  }

  handleIotMsg(topic, payload) {
    let data 
    try {
      data = JSON.parse(payload.toString())
    } catch(e) {
      return console.log('MQTT PAYLOAD FORMATE ERROR')
    }
    if (topic.endsWith('pipe')) {
      try{
        this.checkMessage(data)
      } catch(e) {
        return this.reqCommand(data, e)
      }
      if (data.urlPath.startsWith('/winasd')) {
        let { urlPath, verb, body, params, headers } = data
        let bodym = Object.assign({}, body, params)
        if (urlPath === '/winasd/info') {
          return this.reqCommand(data, null, this.ctx.view())
        }
        else if (urlPath === '/winasd/device') {
          return this.ctx.updateDeviceName(null, bodym.name, err => 
            this.reqCommand(data, err, {}))
        } else {
          return this.reqCommand(data, formatError('not found'))
        }
      } else
        this.ctx.winas && this.ctx.winas.sendMessage({ type: 'pipe', data })
    } else if (topic.endsWith('users')) {
      this.ctx.winas && this.ctx.winas.sendMessage({ type: 'userUpdate', data})
    } else if (topic.endsWith('token')){
      this.ctx.token = data.token
    } else {
      console.log('miss message: ', topic, data)
    }
  }

  reqCommand (message, error, res, isFetch, isStore) {
    let resErr
    if (error) {
      error = formatError(error)
      resErr = error
    }

    let uri = getURL(this.sn, message.sessionId, false)
    if (isFetch) uri += '/pipe/fetch'
    else if (isStore) uri += '/pipe/store'
    else uri += '/json'
    debug(uri)
    return request({
      uri: uri,
      method: 'POST',
      headers: { 
        Authorization: this.ctx.token,
        'Cookie': message.headers['cookie']
      },
      body: true,
      json: {
        error : resErr,
        data: res
      }
    }, (error, response, body) => {
      if (error) return debug('reqCommand error: ', error)
      debug('reqCommand success:',response.statusCode)
    })
  }

  publish(...args) {
    this.state.publish(...args)
  }

  subscribe(...args) {
    this.state.subscribe(...args)
  }

  connect(){
    this.state.connect()
  }

  get status() {
    return this.state.constructor.name
  }

  view() {
    return {
      state: this.status
    }
  }

  destroy() {
    this.state.destroy()
  }
}

Channel.prototype.Connecting = Connecting
Channel.prototype.Connected = Connected
Channel.prototype.Failed = Failed

module.exports = Channel
