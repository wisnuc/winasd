const request = require('superagent')
const fs = require('fs')
const state = require('../lib/state')
const Fetch = require('../lib/fetch')
const Download = require('../lib/download')
const event = require('events')
const UUID = require('uuid')
const Config = require('config')

const upgradeConf = Config.get('upgrade')
const isHighVersion = (current, next) => current < next

class Upgrade extends event {

  constructor (ctx, tmpDir, dir) {
    super()
    this.ctx = ctx
    this.tmpDir = tmpDir
    this.dir = dir
    this.fetcher = new Fetch(true)
    this.fetcher.on('Pending', this.onFetchData.bind(this))
    this.currentVersion = '0.0.0'
    try {
      this.currentVersion = fs.readFileSync(upgradeConf.version).toString().trim()
    } catch (e) { console.log(e) }
    
  }

  get downloader() {
    return this._downloader
  }

  set downloader(value) {
    if (this._downloader) {
      this._downloader.removeAllListeners()
      this._downloader.destroy()
    }
    this._downloader = value
    this._downloader.on('Finished', () => {console.log('Download Finished')})
    this._downloader.on('Failed', () => {console.log('Failed')})
  }

  // 文件命名： abel-20181021-0.1.1-acbbbcca
  onFetchData() {
    let data = this.fetcher.last.data
    if (this.fetcher.last.error || !data) return // fetch error
    let docs = data.filter(d => d.Key.endsWith('.json')).sort((a, b) => a.LastModified < b.LastModified)
    if (docs.length) {
      let latest = docs[0]
      let nameArr = latest.Key.slice(0, -5).split('-').map(x => x.trim())
      if (nameArr.length && nameArr.length === 4) {
        const version = nameArr[2]
        if (isHighVersion(this.currentVersion, version)) {
          // check if downloading
          if (this.downloader && !isHighVersion(this.downloader.version, version)) {
            console.log('already downloading')
          } else {
            this.downloader = new Download(latest.Key, this.tmpDir, this.dir, version)
          }
        } else {
          console.log('current system is newest')
        }
      }
      else {
        console.log('Invalid doc name: ', latest.Key)
      }
    }
    else 
      console.log('Invalid Fetch Data')
  }

  list (callback) {
    return callback ? this.fetcher.start(callback) : this.fetcher.view()
  }
}

module.exports = Upgrade