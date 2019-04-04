const Promise = require('bluebird')
const Config = require('config')
const mkdirpAsync = Promise.promisify(require('mkdirp'))
const rimrafAsync = Promise.promisify(require('rimraf'))
const path = require('path')
const fs = require('fs')
const child = Promise.promisifyAll(require('child_process'))
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
const { reqBind, reqUnbind, verify, refresh } = require('../lib/lifecycle')
const Device = require('../lib/device')
const initEcc = require('../lib/atecc')

const ProvisionFile = path.join(Config.storage.roots.p, Config.storage.files.provision)

const NewError = (message, code) => Object.assign(new Error(message), { code })
const EPERSISTENT = NewError('mount persistent partition failed', 'EPERSISTENT')
const EUSERSTORE = NewError('user store load failed', 'EUSERSTORE')
const EDEVICE = NewError('device info load failed', 'EDEVICE')
const EBOUND = NewError('device cloud bound with error signature', 'EBOUND')
const EECCINIT = NewError('ecc init error', 'EECCINIT')
const EECCPRESET = NewError('ecc preset error', 'EECCPRESET')

class BaseState extends State {
  requestBind(...args) {
    if (args.length) {
      args.pop()(new Error('error state'))
    }
  }

  requestUnbind(...args) {
    if (args.length) {
      args.pop()(new Error('error state'))
    }
  }
}

class Prepare extends BaseState {
  enter() {
    // mount and init persistence partition
    this.initPersistenceAsync().then(() => {
      Config.system.withoutEcc ? this.startupWithoutEcc()
        : this.startup()
    }, err => this.setState('Failed', EPERSISTENT))
  }

  async initPersistenceAsync() {
    return
    await mkdirpAsync(Config.storage.roots.p)
    await child.execAsync(`mount -U ${Config.storage.uuids.p} ${Config.storage.roots.p}`)
    await rimrafAsync(Config.storage.dirs.tmpDir)
    await mkdirpAsync(Config.storage.dirs.tmpDir)
    await mkdirpAsync(Config.storage.dirs.isoDir)
    await mkdirpAsync(Config.storage.dirs.certDir)
    await mkdirpAsync(Config.storage.dirs.bound)
    await mkdirpAsync(Config.storage.dirs.device)
  }

  startupWithoutEcc() {
    if (!fs.existsSync(ProvisionFile)) {
      return this.setState('Provisioning')
    } else {
      this.loadUserStore((err, userStore) => {
        if (err) return this.setState('Failed', EUSERSTORE)
        this.loadDevice((err, device) => {
          if (err) return this.setState('Failed', EDEVICE)
          this.ctx.userStore = userStore
          this.ctx.deviceInfo = device
          this.ctx.deviceSN = device.sn
          this.setState('Starting')
        })
      })
    }
  }

  startup() {
    initEcc(Config.ecc.bus, (err, ecc) => {
      if (err) return this.setState('Failed',EECCINIT)
      ecc.preset(e => {
        if(e) return this.setState('Failed',EECCPRESET)
        this.ctx.ecc = ecc
        this.loadDevice((err, { sn }) => { // provision use sn
          if (err) return this.setState('Failed', EDEVICE)
          this.ctx.deviceSN = sn
          this.startupWithoutEcc()
        })
      })
    })
  }

  loadUserStore(callback) {
    let userStore = new DataStore({
      isArray: false,
      file: path.join(Config.storage.dirs.bound, Config.storage.files.boundUser),
      tmpDir: path.join(Config.storage.dirs.tmpDir)
    })

    userStore.once('Update', () => {
      return callback(null, userStore)
    })

    userStore.once('StateEntered', state => {
      if(state === 'Failed')
        return callback(userStore.state.err)
    })
  }

  // read SN...
  loadDevice(callback) {
    if (Config.system.withoutEcc) {
      fs.readFile(path.join(Config.storage.dirs.certDir, 'deviceSN'), (err, data) => {
        if (err) return callback(err)
        return callback(null, { sn: data.toString().trim()})
      })
    } else {
      this.ctx.ecc.serialNumber({}, (err, sn) => {
        if (err) return callback(err)
        return callback(null, { sn })
      })
    }
  }
}

class Provisioning extends BaseState {
  enter() {
    console.log('run in provision state')
    this.ctx.bled = new Bled(this.ctx)
    this.ctx.bled.on('connect', () => {
      this.ctx.net = new NetworkManager(this.ctx)
      this.ctx.net.on('started', state => {
        // if (state !== 70) {
        this.ctx.net.connect('Xiaomi_123', 'wisnuc123456', (err, data) => {
          console.log('Net Module Connect: ', err, data)
        })
        // }
      })
      this.ctx.net.once('connect', () => {
        this.ctx.provision = new Provision(this.ctx)
        this.ctx.provision.on('Finished', () => {
          this.ctx.provision.removeAllListeners()
          this.ctx.provision.destroy()
          this.ctx.provision = undefined
          console.log('*** Provision finished, need reboot ***')
        })
      })
    })
  }
}

class Starting extends BaseState {
  enter() {
    console.log('run in normal state')
    this.ctx.localAuth = new LocalAuth(this.ctx)
    this.ctx.bled = new Bled(this.ctx)
    this.ctx.bled.on('connect', () => {
      this.ctx.net = new NetworkManager(this.ctx)
      this.ctx.net.on('started', state => {
        console.log('NetworkManager Started: ', state)
        if (state !== 70) {
          console.log('Device Network Disconnect', state)
        }
      })
      this.ctx.net.on('connect', () => {
        process.nextTick(() => this.ctx.channel && this.ctx.channel.connect())
      })
    })
    if (this.ctx.userStore.data) {
      this.setState('Bound')
    } else {
      this.setState('Unbind')
    }
  }
}

class Unbind extends BaseState {
  enter() {
    this.ctx.channel = new Channel(this.ctx)
    this.ctx.channel.once('ChannelConnected', (device, user) => {
      if (user){ // mismatch
        console.log('****** cloud device bind state mismatch, check signature *****')
        verify(device.info.signature, (err, verifyed) => {
          if (err || !verifyed) {
            console.log('*** cloud device bind state mismatch, device in unbind ***')
            this.setState('Failed', EBOUND)
          } else {
            this.setState('Binding', user)
          }
        })
      } else {
        console.log('*** cloud device bind state match ***')
      }
    })
  }

  requestBind(encrypted, callback) {
    if (this.bindingFlag) return process.nextTick(() => callback(new Error('allready in binding state')))
    this.bindingFlag = true
    if (!this.ctx.token) return process.nextTick(() => callback(new Error('Winas Net Error')))
    return reqBind(encrypted, this.ctx.token, (err, data) => {
      if (err) {
        this.bindingFlag = false
        return callback(err)
      }
      let user = {
        id: data.data.id,
        username: data.data.username,
        phone: data.data.username
      }
      this.setState('Binding', user, callback)
    })
  }

  exit() {
    this.ctx.channel.removeAllListeners()
    this.ctx.channel.destroy()
    this.ctx.channel = undefined
  }
}

class Binding extends BaseState {
  enter(user, callback = () => {}) {
    this.start(user)
      .then(() => (process.nextTick(() => callback(null,user)), this.setState('Bound')))
      .catch(e => (process.nextTick(() => callback(Object.assign(new Error('clean drive failed'), 
        { code: 'EBINDING' }))), this.setState('Failed', Object.assign(e, { code: 'EBINDING' }))))
  }

  async start(user) {
    await this.cleanVolumeAsync()
    // save user
    await new Promise((resolve, reject) => this.ctx.userStore.save(user, err => err ? reject(err) : resolve()))
    // refresh lifecycle
    await new Promise((res, rej) => refresh(err => err ? rej(err) : res()))
    // update ble advertisement
    this.ctx.bled.updateAdv()
  }

  async cleanVolumeAsync() {
    // FIXME: where is the data device
    try {
      await child.execAsync('umount /dev/sda2')
    } catch (e){
      if (!e.message || !e.message.includes('not mounted')){ 
        throw e
      }
    }
    // FIXME:
    await child.execAsync(`mkfs.btrfs -f /dev/sda2`)

    await child.execAsync('partprobe')
  }
}

class Unbinding extends BaseState {
  enter() {
    this.doUnbind()
      .then(() => this.setState('Unbind'))
      .catch(e => this.setState('Failed', Object.assign(e, { code: 'EUNBINDING' })))
  }

  async doUnbind() {
    // delete user info
    await new Promise((resolve, reject) => this.ctx.userStore.save(null, err => err ? reject(err) : resolve()))
    // refresh lifecycle
    await new Promise((res, rej) => refresh(err => err ? rej(err) : res()))
    // update ble advertisement
    this.ctx.bled.updateAdv()
  }
}

class Bound extends BaseState {
  enter() {
    this.ctx.channel = new Channel(this.ctx)
    this.ctx.channel.on('ChannelConnected', (device, user) => {
      if (!user) {
        console.log('****** cloud device Bound state mismatch, check signature *****')
        verify(device.info && device.info.signature, (err, verifyed) => {
          if (err || !verifyed) {
            console.log('*** cloud device bound state mismatch, device in bound ***')
            this.setState('Failed', EBOUND)
          } else {
            this.setState('Unbinding', user)
          }
        })
      } else {
        //ignore
      }
    })
    this.ctx.winas = new Winas(this.ctx)
    this.unbindFlag = false
  }

  // only from channel
  /**
   * @param {object} message - pipe message 
   */
  requestUnbind(encrypted, callback) {
    if (this.unbindFlag) return callback(new Error('error state'))
    if (!this.ctx.token) return callback(new Error('network error'))
    this.unbindFlag = true
    reqUnbind(encrypted, this.ctx.token, (err, data) => {
      if (err) return callback(err)
      process.nextTick(() => callback(null, null))
      this.setState('Unbinding')
    })
  }

  exit() {
    this.ctx.channel.removeAllListeners()
    this.ctx.channel.destroy()
    this.ctx.channel = undefined
    this.ctx.winas.destroy()
    this.ctx.winas = undefined
  }
}

class Failed extends BaseState {
  enter(reason) {
    this.reason = reason
  }
}


class AppService {
  constructor() {
    this.config = Config
    this.upgrade = new Upgrade(this, Config.storage.dirs.tmpDir, Config.storage.dirs.isoDir)

    Object.defineProperty(this, 'winas', {
      get() {
        return this._winas
      },
      set(x) {
        if(this._winas) {
          this._winas.removeAllListeners()
          if (!this._winas.destroyed)
            this._winas.destroy()
        }
        this._winas = x
        x && this._winas.on('Started', this.handleWinasStarted.bind(this))
        x && this._winas.on('message', this.handleWinasMessage.bind(this))
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

    new Prepare(this)
  }

  // send token&&owner to winas while Winas started
  handleWinasStarted() {
    this.winas.sendMessage({
      type: 'token',
      data: this.token
    })

    this.userStore.data && this.winas.sendMessage({
      type: 'boundUser',
      data: this.userStore.data
    })
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

  requestBind(...args) {
    this.state.requestBind(...args)
  }
  
  requestUnbind(...args) {
    this.state.requestUnbind(...args)
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

AppService.prototype.Prepare = Prepare
AppService.prototype.Provisioning = Provisioning
AppService.prototype.Starting = Starting
AppService.prototype.Unbind = Unbind
AppService.prototype.Binding = Binding
AppService.prototype.Bound = Bound
AppService.prototype.Unbinding = Unbinding
AppService.prototype.Failed = Failed

module.exports = AppService