const fs = require('fs')
const Fetch = require('../lib/fetch')
const Download = require('../lib/download')
const event = require('events')
const Config = require('config')
const debug = require('debug')('ws:upgrade')

const upgradeConf = Config.get('upgrade')
const isHighVersion = (current, next) => current < next

/**
 * fetch + download
 * 检查S3是否有新版本、解析新版本metadata
 * 然后下载新版本
 */
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
    } catch (e) { 
      console.log(e)
    }
    
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
    this._downloader.on('Finished', () => {})
    this._downloader.on('Failed', () => {})
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
            debug('already downloading')
          } else {
            this.downloader = new Download(latest.Key, this.tmpDir, this.dir, version)
          }
        } else {
          debug('current system is newest')
        }
      }
      else {
        debug('Invalid doc name: ', latest.Key)
      }
    }
    else 
      debug('Invalid Fetch Data')
  }

  list (callback) {
    return callback ? this.fetcher.start(callback) : this.fetcher.view()
  }

  view() {
    return {
      fetch: this.fetcher && this.fetcher.view(),
      download: this.downloader && this.downloader.view()
    }
  }
}

module.exports = Upgrade