const Config = require('config')
const mkdirp = require('mkdirp')
const rimraf = require('rimraf')
const path = require('path')
const fs = require('fs')
const child = require('child_process')
const debug = require('debug')('ws:app')

const DataStore = require('../lib/DataStore')
const State = require('../lib/state')

const NetworkManager = require('./network')
const Upgrade = require('./upgrade')
const Bled = require('./bled')
const LocalAuth = require('./localAuth')
const Provision = require('./provision')
const Winas = require('./winas')
const Channel = require('./channel')
const { reqBind } = require('../lib/lifecycle')
const Device = require('../lib/device')

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
      mkdirp.sync(Config.storage.dirs.device)
    } catch(e) {
      console.log(e)
    }

    this.userStore = new DataStore({
      isArray: false,
      file: path.join(Config.storage.dirs.bound, Config.storage.files.boundUser),
      tmpDir: path.join(Config.storage.dirs.tmpDir)
    })

    this.userStore.on('Update', this.handleOwnerUpdate.bind(this))

    try {
      this.deviceSN = fs.readFileSync(path.join(Config.storage.dirs.certDir, 'deviceSN')).toString().trim()
    } catch(e) {
      //FIXME:
      console.log('no deviceSN')
    }

    this.upgrade = new Upgrade(this, Config.storage.dirs.tmpDir, Config.storage.dirs.isoDir)

    Object.defineProperty(this, 'winas', {
      get() {
        return this._winas
      },
      set(x) {
        if(this._winas) {
          this._winas.removeAllListeners()
          this._winas.destroy()
        }
        this._winas = x
        this._winas.on('Started', this.handleWinasStarted.bind(this))
        this._winas.on('message', this.handleWinasMessage.bind(this))
      }
    })

    Object.defineProperty(this, 'token', {
      get() {
        return this._token
      },
      set(x) {
        this._token = x
        this.winas && this.winas.sendMessage({
          type: 'token',
          data: x
        })
      }
    })


    if (fs.existsSync(path.join(Config.storage.roots.p, Config.storage.files.provision))) {
      this.startServices()
    } else {
      this.startProvision()
    }

  }

  // update user persistent store
  updateOwner(user, callback) {
    this.userStore.save(user, callback)
  }

  // send token&&owner to winas while Winas started
  handleWinasStarted() {
    this.winas.sendMessage({
      type: 'token',
      data: this.token
    })

    this.handleOwnerUpdate()
  }

  // send owner to winas
  handleOwnerUpdate() {
    this.userStore.data && this.winas.sendMessage({
      type: 'boundUser',
      data: this.userStore.data
    })
    //TODO: update ble advertisement
  }

  /**
   * handle messages form winas
   * @param {object} message 
   * message.type
   * message.data .....
   */
  handleWinasMessage(message) {
    debug('FROM WINAS MESSAGE:\n', message)
  }

  // starting in provision mode
  startProvision() {
    console.log('run in provision state')
    this.bled = new Bled(this)
    this.bled.on('connect', () => {
      this.net = new NetworkManager(this)
      this.net.on('started', state => {
        if (state !== 70) {
          this.net.connect('Xiaomi_123', 'wisnuc123456', (err, data) => {
            console.log('Net Module Connect: ', err, data)
          })
        }
      })
      this.net.on('connect', () => {
        this.provision = new Provision()
        this.provision.on('Finished', () => {
          this.provision.removeAllListeners()
          this.provision.destroy()
          this.provision = undefined
        })
      })
    })
  }

  // starting in normal mode
  startServices () {
    console.log('run in normal state')
    this.localAuth = new LocalAuth(this)
    this.bled = new Bled(this)
    this.bled.on('connect', () => {
      this.net = new NetworkManager(this)
      this.net.on('started', state => {
        console.log('NetworkManager Started: ', state)
        if (state !== 70) {
          console.log('Device Network Disconnect', state)
        }
      })
      this.net.on('connect', () => {
        process.nextTick(() => this.channel && this.channel.connect())
      })
    })
    this.winas = new Winas(this)
    this.channel = new Channel(this)
  }
  
  // return current software mode
  isBeta() {
    return true
  }

  // return node path
  nodePath () {
    return this.config.system.globalNode ? 'node' : '/mnt/winas/node/bin/node'
  }

  // start winas
  appStart (callback) {
    if (!this.winas) return process.nextTick(() => callback(EApp404))
    if (this.operation) return process.nextTick(() => callback(ERace))
    this.operation = 'appStart'
    this.winas.startAsync()
      .then(() => (this.operation = null, callback(null)))  
      .catch(e => (this.operation = null, callback(e)))
  }

  // stop winas
  appStop (callback) {
    if (!this.winas) return process.nextTick(() => callback(EApp404))
    if (this.operation) return process.nextTick(() => callback(ERace))
    this.operation = 'appStop'
    this.winas.stopAsync()
      .then(() => (this.operation = null, callback(null)))  
      .catch(e => (this.operation = null, callback(e)))
  }

  getUpgradeList(cb) {
    return this.upgrade.list(cb)
  }

  updateDeviceName (user, name, callback) {
    Device.setDeviceName(name, (err, data) => {
      callback(err, data)
      this.deviceUpdate()
    })
  }

  // send mqtt message to cloud if device update
  deviceUpdate () {
    this.channel && this.deviceSN && this.channel.publish(`device/${ this.deviceSN }/info`, JSON.stringify({ 
      lanIp: Device.networkInterface().address,
      name: Device.deviceName()
    }))
  }

  boundDevice(encrypted, callback) {
    if (!this.token) return process.nextTick(() => callback(new Error('Winas Net Error')))
    if (this.winas.users && this.winas.users.length === 0) {
      return reqBind(encrypted, this.token, (err, data) => {
        if (err) return callback(err)
        let user = data.data
        this.updateOwner({
          id: user.id,
          username: user.username,
          phone: user.username
        }, err => {
          callback(err, user)
        })
      })
    }
    return process.nextTick(() => callback(new Error('Winas State Error')))
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
      device: Device.hardwareInfo()
    }
  }

  destroy() {
    if (this.winas) this.winas.destroy()
  }
}

module.exports = AppService