const EventEmitter = require('events')
const xmlPaser = require('fast-xml-parser')
const request = require('superagent')
const Config = require('config')

const fetchConf = Config.get('upgrade.fetch')

const State = require('./state')

const HOUR = 3600 * 1000

const MINUTE = 1000 * 60

class Pending extends State {

  enter (err, data) {
    super.enter()
    this.ctx.last = {
      time: new Date().getTime(),
      error: err || null,
      data: data || null
    }

    this.startTime = new Date().getTime()
    this.timeout = err ? 1 * MINUTE : 10 * MINUTE
    this.timer = setTimeout(() => this.setState('Working'), 1000 * 60 * 60) 

    if (data) this.ctx.emit('update', data)
  }

  exit () {
    clearTimeout(this.timer)
    super.exit()
  }

  view () {
    return {
      startTime: this.startTime,
      timeout: this.timeout,
    }  
  }
  // call it now
  start (callback) {
    this.setState('Working', callback)
  }
}

class Working extends State {

  enter (callback) {
    super.enter()
    if (callback) this.callbacks = [callback]
    this.req = request
      .get(this.ctx.url)
      .end((err, res) => {
        if (err) {
          this.err = err
          this.setState('Pending', err)
        } else if (!res.ok) {
          this.err = new Error('http error')
          err.code = 'EHTTPSTATUS' 
          err.res = res
          this.setState('Pending', err)
        } else {
          try { 
            this.data = xmlPaser.parse(res.body.toString()).ListBucketResult.Contents
          } catch(e) {
            this.err = e
            return this.setState('Pending', e)
          }
          this.setState('Pending', null, this.data)
        }
      })
  }

  exit () {
    // call all callbacks
    if (this.callbacks) {
      this.callbacks.forEach(cb => cb(this.err, this.data))
      this.callbacks = undefined
    }
    if (this.req && this.req.abort) this.req.abort()
    super.exit()
  }

  start (callback) {
    this.callbacks = Array.isArray(this.callbacks) ? [...this.callbacks, callback] : [callback]
  }
}

class Fetch extends EventEmitter {

  constructor (isBeta) {
    super() 
    this.url = isBeta ? fetchConf.beta : fetch.release
    this.last = null

    new Working(this)
  }

  get status() {
    return this.state.constructor.name
  }

  start (callback) {
    this.state.start(callback)
  }

  view () {
    let last = null
    if (this.last) {
      last = Object.assign({}, this.last)
      if (last.error) {
        last.error = {
          message: last.error.message,
          code: last.error.code
        }
      }
    }

    return {
      state: this.status,
      view: this.state.view(),
      last,
    } 
  }

  destroy () {
    this.state.destroy()
  }
}

Fetch.prototype.Pending = Pending
Fetch.prototype.Working = Working

module.exports = Fetch