const Promise = require('bluebird')
const path = require('path')
const fs = require('fs')
const child = require('child_process')
const EventEmitter = require('events')

const rimraf = require('rimraf')
const mkdirp = require('mkdirp')

const debug = require('debug')('ws:winas')

/**
nexe does not work properly for unknown reason.
*/
class State {

  constructor(ctx, ...args) {
    this.ctx = ctx
    ctx.state = this
    this.enter(...args)

    if (ctx instanceof EventEmitter) ctx.emit(this.constructor.name)
  }

  setState (state, ...args) {
    this.exit()
    new this.ctx[state](this.ctx, ...args)
  }

  enter () {
    debug(`${this.ctx.constructor.name} enter ${this.constructor.name} state`)
  }

  exit () {
    debug(`${this.ctx.constructor.name} exit ${this.constructor.name} state`)
  }

  destroy () {
    if (this.winas) {
      this.winas.removeAllListeners()
      this.winas.on('error', () => {})
      this.winas.kill()
      this.winas = null
    }

    this.exit()
  }

  start () {}

  stop () {}

  view () { return null }

}

class Stopped extends State {

  start () {
    this.setState('Starting')
  }
}

class Starting extends State {

  enter () {
    super.enter()

    if (!process.argv.includes('--useWinas')) {
      return
    }
    const opts = {
      cwd: this.ctx.winasDir,

      /**
      node must be in path, for there is no global node in future
      */
      env: Object.assign({}, process.env, { 
        PATH: `/wisnuc/node/base/bin:${process.env.PATH}`,
        NODE_ENV: process.env.WINAS_ENV ? process.env.WINAS_ENV : 'winas',
        NODE_CONFIG_ENV: process.env.WINAS_ENV ? process.env.WINAS_ENV : 'winas',
        NODE_CONFIG_DIR: '/winas/build/config/'
      }),
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'] 
    }
    let appPath = path.join(this.ctx.winasDir, 'build', 'app.js')
    let args = [appPath, ...process.argv.slice(2)]

    this.winas = child.spawn(this.ctx.nodePath(), args, opts)
    this.winas.on('error', err => console.log('Winas Error in Starting: neglected', err))
    this.winas.once('message', message => (this.ctx.emit('message', message), this.setState('Started', this.winas)))
    this.winas.on('close', (code, signal) => (this.winas = null, this.setState('Failed', { code, signal })))
  }

  stop () {
    this.setState('Stopping', this.winas)
  }

  exit () {
    if (this.winas) this.winas.removeAllListeners()
    clearTimeout(this.timer)
    this.timer = null
    super.exit()
  }

}

class Started extends State {

  enter (winas) {
    super.enter()
    this.winas = winas
    this.winas.on('error', err => console.log('Winas Error in Started: neglected', err))
    this.winas.on('close', (code, signal) => (this.winas = null, this.setState('Failed', { code, signal})))
    this.winas.on('message', message => this.handleWinasMessage(message))
    // this.ctx.ctx.emit('winasStarted')
  }

  handleWinasMessage(message) {
    let obj
    try {
      obj = JSON.parse(message)
    } catch (e) {
      return console.log('FROM_WINAS_MESSAGE, parse error: ', e)
    }

    if (obj.type === 'appifi_users') {
      this.users = obj.users
    }

    this.ctx.emit('message', obj)
  }

  stop () {
    this.setState('Stopping', this.winas)
  }

  exit () {
    if (this.winas) {
      this.winas.removeAllListeners()
      this.winas.on('error', () => {})
      if (!this.winas.killed) this.winas.kill()
    }
    this.winas = undefined
    this.users = undefined
    super.exit()
  }

}

// Stopping can only be entered when being stopped externally, so it always goes to Stopped state
class Stopping extends State {

  enter (winas) {
    super.enter()
    winas.kill()
    winas.on('error', err => console.log('Winas Error in Started: neglected', err))
    winas.on('close', (code, signal) => this.setState('Stopped'))
  }

}

// Failed and Started are XOR destination of start operation
class Failed extends State {

  enter (err) {
    super.enter()
    this.error = err
    this.timer = setTimeout(() => this.setState('Starting'), 1000 * 30) 

    // failed can only be landed for start request
    this.ctx.startCbs.forEach(cb => cb(this.error))
    this.ctx.startCbs = []
  }

  start () {
    this.setState('Starting')
  }

  stop () {
    this.setState('Stopped')
  }

  exit () {
    clearTimeout(this.timer) 
    this.timer = null
    super.exit()
  }
}

// 负责整个 winas 生命周期
class Winas extends EventEmitter {

  /**
  Create Winas
  @param {object} ctx - the model. ctx.releases is guaranteed to be available.
  @param {string} tagName - the currently deployed version
  */
  constructor(ctx) {
    super()
    this.ctx = ctx
    this.winasDir = ctx.config.storage.dirs.winasDir

    // mutual exclusive
    this.startCbs = []
    this.stopCbs = []
    new Starting(this)
  }

  get users() {
    if (this.getState() !== 'Started') return
    if (!this.state.users) return
    return this.state.users
  }

  getState() {
    return this.state.constructor.name
  }

  nodePath () {
    return this.ctx.nodePath()
  }

  isBeta () {
    return this.ctx.isBeta()
  }

  // start may land started or failed
  start (callback = () => {}) {
    if (this.stopCbs.length) {
      let err = new Error('winas is requested to stop')
      err.code = 'ERACE'
      process.nextTick(() => callback(err))
      return
    }

    if (this.getState() === 'Started') {
      process.nextTick(() => callback(null))
      return
    }

    if (!this.startCbs.length) {
      const f = err => (this.startCbs.forEach(cb => cb(err)), this.startCbs = [])
      const startedHandler = () => (this.removeListener('Failed', failedHandler), f(null))
      const failedHandler = () => (this.removeListener('Started', startedHandler), f(this.state.error))
      this.once('Started', startedHandler)
      this.once('Failed', failedHandler)
      process.nextTick(() => this.state.start())
    }

    this.startCbs.push(callback)
  }

  async startAsync () {
    return new Promise((res, rej) => this.start(err => err ? rej(err) : res(null)))
  }

  // stop may land stopped
  stop (callback = () => {}) {
    if (this.startCbs.length) {
      let err = new Error('winas is requested to start')
      err.code = 'ERACE'
      process.nextTick(() => callback(err))
      return
    }

    if (this.getState() === 'Stopped') {
      process.nextTick(() => callback(null))
      return
    }

    if (!this.stopCbs.length) {
      this.once('Stopped', () => (this.stopCbs.forEach(cb => cb(null)), this.stopCbs = []))
      process.nextTick(() => this.state.stop())
    }

    this.stopCbs.push(callback)
  }

  async stopAsync () {
    return new Promise((res, rej) => this.stop(err => err ? rej(err) : res(null)))
  }

  sendMessage(obj) {
    let message
    try {
      message = JSON.stringify(obj)
    } catch (error) {
      console.log('[WINAS]warning :', error, message)
      return
    }
    if(this.getState() !== 'Started') 
      return console.log(`[WINAS]warning : winas in ${ this.state.constructor.name } state`, message)
    debug('*******Send To Winas*******\n', message)
    this.state.winas.send && this.state.winas.send(message)
  }

  view () {
    return {
      state: this.getState(),
      isBeta: this.isBeta(),
      users: this.users
    }
  }

  destroy () {
    this.state.destroy()

    let err = new Error('app is destroyed')
    err.code = 'EDESTROYED'
    
    this.startCbs.forEach(cb => cb(err))
    this.stopCbs.forEach(cb => cb(err))
    this.startCbs = []
    this.stopCbs = []
    this.destroyed = true  // allready destroy
  }
}

Winas.prototype.Stopped = Stopped
Winas.prototype.Starting = Starting
Winas.prototype.Started = Started
Winas.prototype.Stopping = Stopping
Winas.prototype.Failed = Failed

module.exports = Winas
