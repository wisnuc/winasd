const Device = require('aws-iot-device-sdk').device
const fs = require('fs')
const path = require('path')
const Config = require('config')
const State = require('../lib/state')
const { networkInterface } = require('../lib/device')

const storageConf = Config.get('storage')
const IOTConf = Config.get('iot')
const certFolder = storageConf.dirs.certDir
const crtName = storageConf.files.cert
const pkeyName = 'device.key'
const caName = storageConf.files.caCert

class Connecting extends State {
  enter (callback) {
    let connectFunc = this.ctx.useFake ? this.fakeConnect.bind(this) : this.realConnect.bind(this)
    connectFunc((err, connection, token, user) => {
      if (err) {
        callback && callback(err)
        return this.setState('Failed', err)
      }
      this.setState('Connected', connection, token, user)
    })
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
      device.publish(`device/${ this.ctx.sn }/info`, JSON.stringify({ lanIp: networkInterface().address }))
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

  realConnect(cb) {

  }

  publish(...args) {
    this.connection.publish(...args)
  }

  subscribe(...args) {
    this.connection.publish(...args)
  }

  connect() {}
  

}

class Connected extends State {
  enter (connection, token, user) {
    this.ctx.ctx.token = token
    this.user = user.owner ? {
      id: user.owner,
      username: user.username,
      phone: user.phoneNumber
    } : null
    this.ctx.ctx.updateDeviceOwner(this.user, () => {})
    this.connection = connection
    this.connection.on('message', this.ctx.handleIotMsg.bind(this.ctx))
    this.connection.on('close', () => this.setState('Failed', new Error('close')))
    this.connection.on('error', err => this.setState('Failed', err))
    this.connection.on('offline', () => this.setState('Failed', new Error('offline')))
    this.connection.subscribe(`cloud/${ this.ctx.sn }/pipe`)
  }

  publish(...args) {
    this.state.publish(...args)
  }

  subscribe(...args) {
    this.state.subscribe(...args)
  }

  connect() {}
  

  exit(){
    this.connection.removeAllListeners()
    this.connection.on('error', () => {})
    this.connection.end()
    this.connection = undefined
    this.ctx.ctx.token = undefined
  }
}

class Failed extends State {
  enter(error) {
    console.log('Failed: ', error)
    this.error = error
    this.timer = setTimeout(() => this.setState('Connecting'), 5000)
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

class Channel extends require('events') {
  constructor(ctx) {
    super()

    this.ctx = ctx

    this.useFake = Config.system.useFake

    this.sn = this.ctx.deviceSN

    new Connecting(this)
  }

  handleIotMsg(topic, payload) {
    let data 
    try {
      data = JSON.parse(payload.toString())
    } catch(e) {
      return console.log('MQTT PAYLOAD FORMATE ERROR')
    }
    if (topic.endsWith('pipe')) {
      this.ctx.winas.sendMessage({ 
        type: 'pipe',
        data
      })
    } else {
      console.log('miss message: ', data)
    }
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
