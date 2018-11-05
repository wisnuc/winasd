const Config = require('config')
const mkdirp = require('mkdirp')
const rimraf = require('rimraf')
const path = require('path')
const fs = require('fs')
const child = require('child_process')

const Upgrade = require('./upgrade')
const Bled = require('./bled')
const Net = require('./net')
const Provision = require('./provision')
const Winas = require('./winas')
const Channel = require('./channel')
const reqBind = require('../lib/bind')

class AppService {
  constructor() {
    this.config = Config
    try {
      mkdirp.sync(Config.storage.roots.p)
      child.execSync(`mount -U ${Config.storage.uuids.p} ${Config.storage.roots.p}`)
    } catch(e) {
      console.log(e.message)
    }
    try {
      rimraf.sync(Config.storage.dirs.tmpDir)
      mkdirp.sync(Config.storage.dirs.tmpDir)
      mkdirp.sync(Config.storage.dirs.isoDir)
      mkdirp.sync(Config.storage.dirs.certDir)
    } catch(e) {
      console.log(e)
    }

    this.Upgrade = new Upgrade(this, Config.storage.dirs.tmpDir, Config.storage.dirs.isoDir)

    if (fs.existsSync(path.join(Config.storage.roots.p, Config.storage.files.provision))) {
      this.startServices()
    } else {
      this.startProvision()
    }
  }

  get winas() {
    return this._winas
  }

  set winas(x) {
    if(this._winas) {
      this._winas.removeAllListeners()
      this._winas.destroy()
    }
    this._winas = x
    this._winas.on('Started', this.handleWinasStarted.bind(this))
    this._winas.on('message', this.handleWinasMessage.bind(this))
  }

  get token() {
    return this._token
  }

  set token(x) {
    this._token = x
    this.winas && this.winas.sendMessage({
      type: 'token',
      data: x
    })
  }

  handleWinasStarted() {
    this.winas.sendMessage({
      type: 'token',
      data: this.token
    })
  }

  /**
   * 
   * @param {object} message 
   * message.type
   * message.data .....
   */
  handleWinasMessage(message) {
    debug('FROM WINAS MESSAGE', message)
  }

  isBeta() {
    return true
  }

  nodePath () {
    return this.config.system.globalNode ? 'node' : '/mnt/winas/node/bin/node'
  }

  appStart (callback) {
    if (!this.winas) return process.nextTick(() => callback(EApp404))
    if (this.operation) return process.nextTick(() => callback(ERace))
    this.operation = 'appStart'
    this.winas.startAsync()
      .then(() => (this.operation = null, callback(null)))  
      .catch(e => (this.operation = null, callback(e)))
  }

  appStop (callback) {
    if (!this.winas) return process.nextTick(() => callback(EApp404))
    if (this.operation) return process.nextTick(() => callback(ERace))
    this.operation = 'appStop'
    this.winas.stopAsync()
      .then(() => (this.operation = null, callback(null)))  
      .catch(e => (this.operation = null, callback(e)))
  }

  startProvision() {
    console.log('run in provision state')
    this.net = new Net()
    this.net.on('Inited', () => {
      this.net.connect('Xiaomi_123', 'wisnuc123456', err => {
        console.log('Net Module Connect: ', err)
      })
    })
    this.net.on('Connected', () => {
      this.provision = new Provision()
      this.provision.on('Finished', () => {
        this.provision.removeAllListeners()
        this.provision.destroy()
        this.provision = undefined
      })
    })

    this.bled = new Bled(Config.ble.port, Config.ble.baudRate, Config.ble.bin)
    this.bled.addHandler('CMD_SCAN', packet => {
      // console.log(packet)
      this.net.scan((err, list) => {
        this.bled.sendMsg(err || list, e => e && console.error('send message via SPS error', e))
      })
    })
    this.bled.addHandler('CMD_CONN', packet => {
      // console.log('CMD_CONN', packet)
      net.connect('Xiaomi_123', 'wisnuc123456', (err, res) => {
        this.bled.sendMsg(err || res, e => e && console.error('send message via SPS error', e))
      })
    })
  }

  startServices () {
    console.log('run in normal state')
    this.net = new Net()
    this.bled = new Bled(Config.ble.port, Config.ble.baudRate, Config.ble.bin)
    this.bled.addHandler('CMD_SCAN', packet => {
      console.log('CMD_SCAN', packet)
      this.net.scan((err, list) => {
        this.bled.sendMsg(err || list, e => e && console.error('send message via SPS error', e))
      })
    })
    this.bled.addHandler('CMD_CONN', packet => {
      console.log('CMD_CONN', packet)
      net.connect('Xiaomi_123', 'wisnuc123456', (err, res) => {
        this.bled.sendMsg(err || res, e => e && console.error('send message via SPS error', e))
      })
    })
    this.winas = new Winas(this)
    this.channel = new Channel(this)
  }

  getUpgradeList(cb) {
    return this.Upgrade.list(cb)
  }

  view() {
    return {
      net: this.net.view(),
      ble: this.ble.view(),
      upgrade: this.upgrade.view(),
      operation: this.operation,
      winas: this.winas ? this.winas.view() : null,
    }
  }

  destroy() {
    if (this.winas) this.winas.destroy()
  }

  boundDevice(encrypted, callback) {
    if (!this.token) return process.nextTick(() => callback(new Error('Winas Net Error')))
    if (this.winas.users && this.winas.users.length === 0) {
      return reqBind(encrypted, this.token, (err, data) => {
        debug('req bind', err, data)
      })
    }
    return process.nextTick(() => callback(new Error('Winas State Error')))
  }
}

module.exports = AppService