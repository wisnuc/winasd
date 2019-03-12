class LocalAuth {
  constructor(ctx) {
    this.ctx = ctx
    this._state = 'Idle' // 'Workding'
    this.timer = undefined // working timer
    Object.defineProperty(this, 'state', {
      get() {
        return this._state
      },
      set(v) {
        console.log('Local Auth Change State :  ', this._state, '  ->  ', v)
        this._state = v
      }
    })
  }

  request(callback) {
    if (this.state === 'Idle') {
      this.state = 'Working'
      setTimeout(() => {
        this.state = 'Idle'
      }, 60 * 1000)
      callback(null, [120, 203, 123, 102])
    } else {
      callback(Object.assign(new Error('busy'), { code: 'EBUSY'}))
    }
  }

  auth(data, callback) {
    if (this.state !== 'Working') return callback(Object.assign(new Error('error state'), { code: 'ESTATE'}))
    clearTimeout(this.timer)
    // check data
    // return
    callback(null, 'abc')
    this.state = 'Idle'
  }

  verify(token) {
    return true
  }
}

module.exports = LocalAuth