const Config = require('config')
const mkdirp = require('mkdirp')
const rimraf = require('rimraf')
const path = require('path')
const fs = require('fs')

const Upgrade = require('./upgrade')
const Bled = require('./bled')
const Net = require('./net')
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
    if (fs.existsSync(path.join(Config.storage.roots.p, Config.storage.files.provision))) {
      this.startServices()
    } else {
      this.startProvision()
    }
  }

  async startServicesAsync () {
    this.Upgrade = new Upgrade(this, Config.storage.dirs.tmpDir, Config.storage.dirs.isoDir)
    this.net = new Net()
    await this.net.initAsync()
    this.bled = new Bled(Config.ble.port)
    await bled.connectAsync()
  }

  startProvision() {
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
  }
  
  getUpgradeList(cb) {
    return this.Upgrade.list(cb)
  }

  burnBLE() {

  }

}

module.exports = AppService