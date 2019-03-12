const BaseState = require('../lib/state')

class State extends BaseState {

}

class Idle extends State {

}

class Authed extends State {

  enter() {
    this.timer = setTimeout(() => {
      this.setState('Idle')
    }, 60 * 1000 * 5)
  }

  exit() {
    clearTimeout(this.timer)
  }
}

class Setting extends State {
  enter(ssid, pwd) {

  }
}

class NetWork extends require('event') {
  constructor(ctx) {
    super()
    this.ctx = ctx
  }

  auth(token, callback) {

  }

  connect(ssid, pwd, callback) {

  }
}

module.exports = NetWork