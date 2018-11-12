const Config = require('config')
const mkdirp = require('mkdirp')
const rimraf = require('rimraf')
const path = require('path')
const fs = require('fs')
const child = require('child_process')
const debug = require('debug')('ws:app')

const DataStore = require('../lib/DataStore')

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
      mkdirp.sync(Config.storage.dirs.bound)
    } catch(e) {
      console.log(e)
    }

    this.userStore = new DataStore({
      isArray: false,
      file: path.join(Config.storage.dirs.bound, Config.storage.files.boundUser),
      tmpDir: path.join(Config.storage.dirs.tmpDir)
    })

    this.userStore.on('Update', this.handleBoundUserUpdate.bind(this))

    try {
      this.deviceSN = fs.readFileSync(path.join(Config.storage.dirs.certDir, 'deviceSN')).toString().trim()
    } catch(e) { throw e }

    this.upgrade = new Upgrade(this, Config.storage.dirs.tmpDir, Config.storage.dirs.isoDir)

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

    this.handleBoundUserUpdate()
  }

  handleBoundUserUpdate() {
    this.userStore.data && this.winas.sendMessage({
      type:"boundUser",
      data: this.userStore.data
    })

    this.bled.setStationStatus(this.boundUser.data ? 1: 0, () => {})
  }

  /**
   * 
   * @param {object} message 
   * message.type
   * message.data .....
   */
  handleWinasMessage(message) {
    debug('FROM WINAS MESSAGE:\n', message)
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
      net.connect(packet.ssid, packet.password, (err, res) => {
        this.bled.sendMsg(err || res, e => e && console.error('send message via SPS error', e))
      })
    })
    this.bled.on('Connected', () => {
      if (this.deviceSN) { // update sn
        this.bled.setStationId(Buffer.from(this.deviceSN.slice(-12)), () => {})
      }
      // update status
      this.bled.setStationStatus(this.boundUser.data ? 1: 0, () => {})
    })
    this.winas = new Winas(this)
    this.channel = new Channel(this)
  }

  getUpgradeList(cb) {
    return this.upgrade.list(cb)
  }

  view() {
    return {
      net: this.net && this.net.view(),
      ble: this.bled && this.bled.view(),
      upgrade: this.upgrade && this.upgrade.view(),
      operation: this.operation,
      winas: this.winas && this.winas.view(),
      provision: this.provision && this.provision.view(),
      channel: this.channel && this.channel.view(),
      device: {
        sn: this.deviceSN
      }
    }
  }

  destroy() {
    if (this.winas) this.winas.destroy()
  }

  boundDevice(encrypted, callback) {
    if (!this.token) return process.nextTick(() => callback(new Error('Winas Net Error')))
    if (this.winas.users && this.winas.users.length === 0) {
      return reqBind(encrypted, this.token, (err, data) => {
        if (err) return callback(err)
        let user = data.data
        this.userStore.save(user, err => {
          callback(null, user)
        })
      })
    }
    return process.nextTick(() => callback(new Error('Winas State Error')))
  }
}

module.exports = AppService