const {
  STRING, OBJECT_PATH, ARRAY, DICT_ENTRY, VARIANT, BYTE, BOOLEAN, UINT32
} = require('../lib/dbus-types')

const equal = require('fast-deep-equal')

/**
 * registe accesspoint change signals
 * events:
 * NM_AP_AccessPointAdded
 * NM_AP_AccessPointRemoved
 */

/**
 * update job
 * {
 *   op: 'StateChanged'
 *   data: {
 *     objPath
 *   }
 * }
 * 
 * {
 *   op: 'DeviceChanged'
 * }
 */
class Device {

  constructor(ctx) {
    this.ctx = ctx
    this.handleFunc = this.handleSignals.bind(this)
    Object.defineProperty(this, 'devices', {
      get(){
        return this._devices || []
      },
      set(v) {
        this.devices.forEach(x => this.ctx.removeSignalHandle(x.objPath, this.handleFunc))
        this._devices = v
        v.forEach(x => this.ctx.addSignalHandle(x.objPath, this.handleFunc))
      }
    })
    this.jobs = []
    this.working = []
    this.ctx.on('NM_DeviceChanged', () => {
      this.jobs = [] // clean current jobs
      this.devices = [] // clean current devices/ remove all listener
      this.working.forEach(x => x.cancel()) // cancel all working jobs
      this.newJob('DeviceChanged')
    }) // reinit
  }

  handleSignals(m) {
    if (m.member === 'StateChanged' && m.interface === 'org.freedesktop.NetworkManager.Device') {
      this.newJob('StateChanged', { objPath: m.path })
    }
  }

  reqSched() {
    if (this.scheduled) return
    this.scheduled = true
    process.nextTick(() => this.schedule())
  }

  schedule() {
    this.scheduled = false
    if (this.working.length) return
    if (!this.jobs.length) return
    let j = this.jobs.shift()
    j.count += 1
    this.working.push(j)
    let finished = err => {
      if (err && j.count < 3) this.jobs.push(j) // push to last wait for retry
      this.working = []
      this.reqSched()
    }
    switch (j.op) {
      case 'StateChanged':
        j.cancel = this.updateDevice(j.data.objPath, finished)
        break
      case 'DeviceChanged':
        j.cancel = this.handleDeviceChanged(finished)
        break
    }
  }

  newJob(op, data) {
    if (this.jobs.find(x => x.op === op && equal(x.data, data))) return
    this.jobs.push({
      op,
      data,
      count: 0
    })
    this.reqSched()
  }

  updateDevice(objPath, callback) {
    let aborted = false
    let cancel = () => aborted = true
    this.ctx.GetAll(objPath, 'org.freedesktop.NetworkManager.Device', (err, data) => {
      if (aborted) return
      if (err) return callback(err)
      let d = data[0].eval().reduce((o, [name, kv]) => Object.assign(o, { [name]: kv[1] }), {})
      let index = this.devices.findIndex(x => x.objPath === objPath)
      if (index !== -1) {
        let device = Object.assign({}, this.devices[index], d, { Ipv4Info: undefined })
        if (device.State === 100 && device.Ip4Config && device.Ip4Config !== '/') {
          // get Ipv4Info
          this.ctx.GetAll(device.Ip4Config, 'org.freedesktop.NetworkManager.IP4Config', (err, data) => {
            if (aborted) return
            if (err) return callback(null)
            let info = data[0].eval().reduce((o, [name, kv]) => Object.assign(o, { [name]: kv[1] }), {})
            device.Ipv4NetInfo = info
            this.devices = [...this.devices.slice(0, index), device, ...this.devices.slice(index + 1)]
            return callback(null)
          })
        } else {
          this.devices = [...this.devices.slice(0, index), device, ...this.devices.slice(index + 1)]
          return callback(null)
        }
      } else
        return callback(Object.assign(new Error('device not found'), { code: 'EUPDATE' }))
    })
    return cancel
  }

  handleDeviceChanged(callback) {
    let aborted = false
    let cancel = () => aborted = true
    this.initDevices((err, data) => {
      if (aborted) return
      if (err) return callback(err)
      this.devices = data || []
      data.forEach(d => {
        this.ctx.dbus.driver.signal({
          path: d.objPath,
          interface: 'org.freedesktop.NetworkManager.Device',
          member: 'StateChanged'
        })
        this.newJob('StateChanged', { objPath: d.objPath }) // do reload to sync state
      })
      return callback(null)
    })
    return cancel
  }

  initDevices(callback) {
    this.ctx.GetDevices((err, data) => {
      if (err) return callback(err)
      let count = data[0].elems.length
      if (count === 0) return callback(null, [])
      let devices = []
      data[0].elems.forEach(x => {
        this.ctx.GetAll(x.value, 'org.freedesktop.NetworkManager.Device', (err, data) => {
          if (!err) {
            let d = data[0].eval().reduce((o, [name, kv]) => Object.assign(o, { [name]: kv[1] }), {})
            d.objPath = x.value
            devices.push(d)
          }
          if (!--count) {
            return callback(null, devices)
          }
        })
      })
    })
  }

  mounted() {
    this.initDevices((err, data) => {
      if (err) {
        this.error = Object.assign(err, { code: 'EINIT' })
      } else {
        this.devices = data || []
        data.forEach(d => {
          this.ctx.dbus.driver.signal({
            path: d.objPath,
            interface: 'org.freedesktop.NetworkManager.Device',
            member: 'StateChanged'
          })
        })
      }
    })
  }

  logout() {

  }
}

module.exports = Device