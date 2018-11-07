const fs = require('fs')
const path = require('path')
const EventEmitter = require('events')
const request = require('superagent')
const mkdirp = require('mkdirp')
const rimraf = require('rimraf')
const Config = require('config')
const crypto = require('crypto')
const UUID = require('uuid')
const debug = require('debug')('ws:downloader')

const State = require('./state')

const HOUR = 1 * 1000 * 60 * 60

const upgradeConf = Config.get('upgrade')

class HashTransform extends require('stream').Transform {
  constructor() {
    super()
    this.hashStream = crypto.createHash('sha256')
    this.length = 0
  }

  _transform(buf, enc, next) {
    this.length += buf.length
    this.hashStream.update(buf, enc)
    this.push(buf)
    next()
  }

  getHash() {
    return this.hashStream.digest('hex')
  }

  destroy() {
    this.hashStream.end()
    super.destroy()
  }
}

class Metadata extends State {
  enter() {
    super.enter()
    const url = upgradeConf.address + '/' + this.ctx.bucketKey
    debug(url)
    this.req = request.get(url)
    this.req
      .then(res => {
        if (!res.ok) {
          let err = new Error('get upgrade metadata error')
          this.setState('Failed', err)
        } else {
          let u = url.slice(0, -5) + '.zip'
          this.setState('Checking', res.body)
        }
      }, error => {
        this.setState('Failed', error)
      })
  }

  exit() {
    if (this.req) this.req.abort()
    super.exit()
  }
}

class Checking extends State {
  enter(data) {
    debug(data)
    super.enter()
    mkdirp.sync(this.ctx.tmpDir)
    mkdirp.sync(this.ctx.dstDir)

    let dstName = [data.name, data.hash, data.version, data.time].join('-') + '.tar.gz'
    let srcP = path.join(this.ctx.dstDir, dstName)
    this.ctx.dstPath = srcP
    this.ctx.fileDoc = data
    // TODO: check free partition version
    fs.lstat(srcP, (err, stat) => {
      if (err) {
        rimraf(srcP, err =>{
          this.setState('Working', data)
        })
      } else {
        this.setState('Finished', srcP, stat.size)
      }
    })
  }
}

//TODO: check hash and write to free partition
class Working extends State {
  enter(data) {
    let tmpPath = path.join(this.ctx.tmpDir, UUID.v4())
    let fHash = data.hash
    let url = upgradeConf.address + '/' + this.ctx.bucketKey.slice(0, -4) + 'zip'
    debug('download url:', url)
    this.rs = request.get(url)
    this.rs.on('error', err => {
      this.destroy()
      this.setState('Failed', err)
    })
    this.rs.on('response', res => {
      if (res.header['content-length']) {
        this.ctx.length = parseInt(res.header['content-length'])
      } else {
        this.ctx.length = 'unknown'
      }
    })
    this.hashT = new HashTransform()
    this.ws = fs.createWriteStream(tmpPath)
    this.ws.on('error', err => {
      this.destroy()
      this.setState('Failed', err)
    })
    this.ws.on('finish', () => {
      let hash = this.hashT.getHash()
      if (hash !== fHash) {
        let e = new Error('hash mismatch')
        e.code = 'EHASHMISMATCH'
        return this.setState('Failed', e)
      }
      if ((this.ctx.length && this.ctx.length !== 'unknown') && this.ctx.length !== this.ws.bytesWritten) {
        let e = new Error('size mismatch')
        e.code = 'ESIZEMISMATCH'
        this.setState('Failed', e)
      } else {
        fs.rename(tmpPath, this.ctx.dstPath, err => {
          if (err) return this.setState('Failed', err)
          this.setState('Finished', tmpPath, this.ws.bytesWritten)
        })
      }
    })
    this.rs.pipe(this.hashT).pipe(this.ws)
  }

  bytesWritten() {
    return this.ws.bytesWritten
  }

  exit() {
  }

  destroy() {
    this.rs.removeAllListeners('error')
    this.rs.removeAllListeners('response')
    this.rs.on('error', () => {})
    this.ws.removeAllListeners()
    this.ws.on('error', () => {})
    this.hashT.unpipe(this.ws)
    this.rs.abort()
    this.ws.destroy()
    this.hashT.destroy()
  }
}

class Failed extends State {
  enter(err) {
    super.enter()
    debug(err)
    this.error = err
    setTimeout(() => this.setState('Metadata'), 1 * HOUR)
  }
}

class Finished extends State {
  enter(fpath, length) {
    super.enter()
    this.fpath = fpath
    this.fLength = length
  }
}

class Download extends EventEmitter {
  constructor(bucketKey, tmpDir, dstDir, version) {
    super()
    this.bucketKey = bucketKey
    this.tmpDir = tmpDir
    this.dstDir = dstDir
    this.version = version
    new Metadata(this)
  }

  bytesWritten() {
    return this.state instanceof Working ? this.state.bytesWritten()
      : this.state instanceof Finished ? this.state.fLength : 0
  }

  get status() {
    return this.state.constructor.name
  }

  destroy() {
    this.state.destroy()
  }

  view() {
    return {
      version: this.version,
      state: this.status,
      bytesWritten: this.bytesWritten()
    }
  }
}

Download.prototype.Working = Working
Download.prototype.Metadata = Metadata
Download.prototype.Failed = Failed
Download.prototype.Finished = Finished
Download.prototype.Checking = Checking

module.exports = Download