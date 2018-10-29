const Config = require('config')
const mkdirp = require('mkdirp')
const rimraf = require('rimraf')
const path = require('path')
const fs = require('fs')

const Upgrade = require('./upgrade')
const Bled = require('./Bled')
const Net = require('./Net')
const Provision = require('./provision')

class AppService {
  constructor() {
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

  startServices () {
    this.net = new Net()
    this.bled = new Bled(Config.ble.port)
    this.bled.addHandler('CMD_SCAN', packet => {
      console.log(packet)
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
  }

  startProvision() {
    this.net = new Net()
    this.net.on('Inited', () => {
      this.net.connect('Xiaomi_123', 'wisnuc123456', err => {
        console.log('Net Module Connect: ', err)
      })
    })
    this.net.on('Connected', () => {
      this.provision = new Provision()
      this.provision.on('Finished', () => {
        let p = path.join(Config.storage.roots.p, Config.storage.files.provision)
        fs.write(p, '1', err => {
          console.log(err)
          this.provision.removeAllListeners()
          this.provision.destroy()
          this,provision = undefined
          this.startServices()
        })
      })
    })

    this.bled = new Bled(Config.ble.port, Config.ble.baudRate)
    this.bled.addHandler('CMD_SCAN', packet => {
      console.log(packet)
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
  }
  
  getUpgradeList(cb) {
    return this.Upgrade.list(cb)
  }

}

module.exports = AppService