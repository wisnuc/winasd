class LocalAuth {
  constructor(ctx) {
    this.ctx = ctx
    this.state = 'Idle' // 'Workding'
    this.timer = undefined // working timer
  }

  request(callback) {
    if (this.state === 'Idle') {
      this.state = 'Working'
      setTimeout(() => {
        this.state = 'Idle'
      }, 30*1000)
      callback(null, [120, 203, 123, 102])
    } else {
      callback(Object.assign(new Error('busy'), { code: 'EBUSY'}))
    }
  }

  auth(data, callback) {
    clearTimeout(this.timer)

    // check data

    // return
    callback(null, 'abc')
  }

  verify(token) {
    return true
  }
}

module.exports = LocalAuth