const Device = require('aws-iot-device-sdk').device
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const Config = require('config')
const State = require('../lib/state')

const storageConf = Config.get('storage')
const IOTConf = Config.get('iot')
const certFolder = storageConf.dirs.certDir
const crtName = storageConf.files.cert
const csrName = storageConf.files.csr
const pkeyName = 'device.key'
const pubKName = 'device.pub'
const snName = 'deviceSN'
const caName = storageConf.files.caCert

class Connecting extends State {
  enter (callback) {
    let connectFunc = this.ctx.useFake ? this.fakeConnect.bind(this) : this.realConnect.bind(this)
    connectFunc((err, connection) => {
      if (err) {
        callback && callback(err)
        return this.setState('Failed', err)
      }
      this.setState('Connected', connection)
    })
  }

  fakeConnect(callback) {
    let sn, device, finished = false
    let cb = (err) => {
      if (finished) return
      finished = true
      device && device.removeAllListeners()
      if (err) {
        device && device.end()
        device = undefined
      }
      callback(err, device)
    }
    device = new Device({
      keyPath: path.join(certFolder, pkeyName),
      certPath: path.join(certFolder, crtName),
      caPath: path.join(certFolder, caName),
      clientId: this.ctx.sn,
      host: IOTConf.endpoint,
    })

    device.on('connect', () => cb())
    device.on('error', cb)
    device.on('offline', () => cb(new Error('offline')))
  }

  realConnect(cb) {

  }
}

class Connected extends State {
  enter (connection) {
    this.connection = connection
    this.connection.on('message', this.ctx.handleIotMsg.bind(this.ctx))
    this.connection.on('close', () => this.setState('Failed', new Error('close')))
    this.connection.on('error', err => this.setState('Failed', err))
    this.connection.on('offline', () => this.setState('Failed', new Error('offline')))
    this.connection.subscribe(`cloud/${ this.ctx.sn }/connected`)
    this.connection.publish(`device/${ this.ctx.sn }/info`, JSON.stringify({ lanIp: '192.168.31.145' }))
  }

  exit(){
    this.connection.removeAllListeners()
    this.connection.on('error', () => {})
    this.connection.end()
    this.connection = undefined
    this.token = undefined
  }
}

class Failed extends State {
  enter(error) {
    console.log(error)
    this.error = error
  }
}

class Channel extends require('events') {
  constructor() {
    super()
    
    this.useFake = Config.system.useFake

    try {
      this.sn = fs.readFileSync(path.join(certFolder, snName)).toString().trim()
    } catch (e) {
      console.log(e)
      throw new Error('SN NOT FOUND')
    }
    new Connecting(this)
  }

  handleIotMsg(topic, payload) {
    console.log(topic, payload)
  }

  get status() {
    return this.state.constructor.name
  }

  view() {
    return {
      state: this.status
    }
  }
}


Channel.prototype.Connecting = Connecting
Channel.prototype.Connected = Connected
Channel.prototype.Failed = Failed

module.exports = Channel