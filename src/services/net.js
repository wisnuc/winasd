const { spawn, exec } = require('child_process')
const events = require('events')
const readline = require('readline')

class Net extends events {
  constructor () {
    super()
    this.state = 'Idle'
    this.connected = false
    this.device = ''
  }

  /* get wifi device name */
  init (cb) {
    exec(`nmcli d | grep wifi`, (error, stdout, stderr) => {
      if (error || stderr) cb(error || stderr)
      else {
        const nic = {}
        try {
          const arr = stdout.split(/\s+/)
          nic.name = arr[0]
          nic.type = arr[1]
          nic.state = arr[2]
          nic.connection = arr[3]
        } catch (err) {
          const e = new Error('No Wifi Device')
          cb(e)
          return
        }
        console.log(nic)
        if (!nic.name || nic.type !== 'wifi') {
          const e = new Error('Init Wifi Device Error')
          cb(e)
          return
        }
        this.device = nic.name
        this.connected = (nic.state === 'connected')
        this.state = 'Idle'
        cb(null, nic.name)
      }
    })
  }

  async initAsync () {
    return Promise.promisify(this.init).bind(this)()
  }

  startMonitor () {
    if (this.monitor) this.monitor.kill()
    this.monitor = spawn('ip', ['monitor'])

    const rl = readline.createInterface({
      input: this.monitor.stdout
    })

    rl.on('line', (line) => {
      const ele = line.toString().trim().split(/\s+/)
      if (ele.includes('host')) console.log(ele)
    })

    this.monitor.stderr.on('data', (data) => {
      console.log(`stderr: ${data.toString().trim()}`)
    })

    this.monitor.on('close', (code) => {
      console.log(`child process exited with code ${code}`)
    })
  }

  status () {
    return ({
      state: this.state,
      connected: this.connected
    })
  }

  /* scan wifi list */
  scan (cb) {
    if (!this.device) {
      const e = new Error('No Wifi Device')
      cb(e)
    } else if (this.state !== 'Idle') {
      const e = new Error('Device Busy')
      cb(e)
    } else {
      this.state = 'scanning'
      exec(`iwlist ${this.device} scan | grep ESSID:`, (error, stdout, stderr) => {
        if (error || stderr) cb(error || stderr)
        else {
          this.state = 'Idle'
          const essids = stdout.split('\n').map(l => l.split(/"/)[1]).filter(v => !!v)
          const uniId = [...new Set(essids)]
          cb(null, uniId)
        }
      })
    }
  }

  /* disconnect current wifi */
  disconnect (cb) {
    if (!this.device) {
      const e = new Error('No Wifi Device')
      cb(e)
    } else if (this.state !== 'Idle') {
      const e = new Error('Device Busy')
      cb(e)
    } else if (this.connected) {
      this.state = 'Disconnecting'
      exec(`nmcli device disconnect ${this.device}`, (error, stdout, stderr) => {
        this.state = 'Idle'
        if (error || stderr) cb(error || stderr)
        else cb(null)
      })
    } else cb(null)
  }

  /* connect to the specified wifi */
  connect (essid, key, cb) {
    if (!this.device) {
      const e = new Error('No Wifi Device')
      cb(e)
    } else if (this.state !== 'Idle') {
      const e = new Error('Device Busy')
      cb(e)
    } else {
      this.state = 'Connecting'
      exec(`nmcli device wifi connect ${essid} password ${key}`, (error, stdout, stderr) => {
        if (error || stderr) {
          this.state = 'Idle'
          cb(error || stderr)
        } else {
          exec(`ifconfig ${this.device}`, (err, stdo, stde) => {
            this.state = 'Idle'
            if (err || stde) cb(err || stde)
            const ip = stdo.toString().split('addr:')[1].split(' ')[0]
            cb(null, { ip })
          })
        }
      })
    }
  }
}

module.exports = Net
