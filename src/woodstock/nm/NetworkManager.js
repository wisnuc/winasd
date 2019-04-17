const UUID = require('uuid')

const DBusObject = require('../lib/dbus-object')
const DBusProperties = require('../lib/dbus-properties')
const DBusObjectManager = require('../lib/dbus-object-manager')
const Setting = require('./Setting')
const AccessPoint = require('./AccessPoint')
const Device = require('./Device')
const debug = require('debug')('ws:nm')
const {
  STRING, OBJECT_PATH, ARRAY, DICT_ENTRY, VARIANT, BYTE, BOOLEAN, UINT32
} = require('../lib/dbus-types')

class NetworkManager extends DBusObject {
  constructor(name) {
    super(name)
    this.addInterface(new DBusProperties())
    this.addInterface(new DBusObjectManager())
    this.handleSignalMap = new Map()
    this.setting = new Setting(this)
    this.accessPoint = new AccessPoint(this)
    this.device = new Device(this)

    Object.defineProperty(this, 'devices', {
      get() {
        return this.device && this.device.devices
      }
    })


    Object.defineProperty(this, 'aps', {
      get() {
        return this.accessPoint && this.accessPoint.aps
      }
    })
  }

  handleSignal(m) {
    if (m && this.handleSignalMap.has(m.path)) {
      this.handleSignalMap.get(m.path).forEach(x => x(m))
    }
  }

  addSignalHandle (path, callback) {
    if (this.handleSignalMap.has(path)) {
      this.handleSignalMap.get(path).push(callback)
    } else {
      this.handleSignalMap.set(path, [callback])
    }
  }

  removeSignalHandle(path, callback) {
    if (this.handleSignalMap.has(path)) {
      let callbacks = this.handleSignalMap.get(path)
      let index = callbacks.findIndex(x => x === callback)
      if (index !== -1) {
        this.handleSignalMap.set(path, [...callbacks.slice(0, index), ...callbacks.slice(index + 1)])
      } 
    }
  }

  mounted() {
    super.mounted()
    this.Enable(false, err => {
      this.Enable(true, () => {
        // restart network
        this.dbus.listen({
          sender: 'org.freedesktop.NetworkManager',
          path: '/org/freedesktop/NetworkManager'
        }, () => {})
        
        this.dbus.driver.on('signal',  m => this.handleSignal(m))
    
        this.dbus.driver.signal({
          path: '/org/freedesktop/NetworkManager',
          interface: 'org.freedesktop.NetworkManager',
          member: 'DeviceAdded',
          signature: 'o',
          body: [
            new OBJECT_PATH(this.objectPath())
          ]
        })
    
        this.dbus.driver.signal({
          path: '/org/freedesktop/NetworkManager',
          interface: 'org.freedesktop.NetworkManager',
          member: 'DeviceRemoved',
          signature: 'o',
          body: [
            new OBJECT_PATH(this.objectPath())
          ]
        })
    
        this.dbus.driver.signal({
          path: '/org/freedesktop/NetworkManager',
          interface: 'org.freedesktop.NetworkManager',
          member: 'StateChanged',
          signature: 'u',
          body: [
            new UINT32(70)
          ]
        })
        
        this.addSignalHandle('/org/freedesktop/NetworkManager', (m) => {
          if (m.member === 'DeviceAdded' || m.member === 'DeviceRemoved') {
            return this.emit('NM_DeviceChanged')
          }
          if (m.member === 'StateChanged') {
            // console.log('NM_StateChanged', m.body[0].value)
            return this.emit('NM_StateChanged', m.body[0].value)
          }
        })
    
        this.setting.mounted()
        this.accessPoint.mounted()
        this.device.mounted()
      })
    })
  }

  Enable(enable, callback) {
    this.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: '/org/freedesktop/NetworkManager',
      'interface': 'org.freedesktop.NetworkManager',
      member: 'Enable',
      signature: 'b',
      body: [
        new BOOLEAN(enable)
      ]
    }, (err, data) => callback && callback(err, data))
  }

  // Get the list of all network devices.
  GetAllDevices(callback) {
    this.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: '/org/freedesktop/NetworkManager',
      'interface': 'org.freedesktop.NetworkManager',
      member: 'GetAllDevices'
    }, (err, data) => callback && callback(err, data))
  }

  // Get the list of realized network devices.
  GetDevices(callback) {
    this.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: '/org/freedesktop/NetworkManager',
      'interface': 'org.freedesktop.NetworkManager',
      member: 'GetDevices'
    }, (err, data) => callback && callback(err, data))
  }

  // Returns the permissions a caller has for various authenticated operations that NetworkManager provides,
  // like Enable/Disable networking, changing WiFi, WWAN, and WiMAX state, etc.
  GetPermissions(callback) {
    this.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: '/org/freedesktop/NetworkManager',
      'interface': 'org.freedesktop.NetworkManager',
      member: 'GetPermissions'
    }, (err, data) => callback && callback(err, data))
  }

  /*
  NM_CONNECTIVITY_UNKNOWN = 0 Network connectivity is unknown.
  NM_CONNECTIVITY_NONE = 1 The host is not connected to any network.
  NM_CONNECTIVITY_PORTAL  = 2 The Internet connection is hijacked by a captive portal gateway.
  NM_CONNECTIVITY_LIMITED = 3 The host is connected to a network, does not appear to be able to reach the full Internet
  NM_CONNECTIVITY_FULL = 4 The host is connected to a network, and appears to be able to reach the full Internet.
  */
  CheckConnectivity(callback) {
    this.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: '/org/freedesktop/NetworkManager',
      'interface': 'org.freedesktop.NetworkManager',
      member: 'CheckConnectivity'
    }, (err, data) => callback && callback(err, data))
  }

  isConnectivity(callback) {
    this.CheckConnectivity((err, data) => {
      if (err) return callback(err)
      return callback(null, data[0].value === 4)
    })
  }

  /*
  NM_STATE_UNKNOWN = 0 
  NM_STATE_ASLEEP = 10 
  NM_STATE_DISCONNECTED = 20
  NM_STATE_DISCONNECTING = 30
  NM_STATE_CONNECTING = 40
  NM_STATE_CONNECTED_LOCAL = 50
  NM_STATE_CONNECTED_SITE = 60 
  NM_STATE_CONNECTED_GLOBAL = 70
  */
  State(callback) {
    this.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: '/org/freedesktop/NetworkManager',
      'interface': 'org.freedesktop.NetworkManager',
      member: 'state'
    }, (err, data) => callback && callback(err, data&&data[0].value))
  }

  //Return the object path of the network device referenced by its IP interface name. 
  //Note that some devices (usually modems) only have an IP interface name when they are connected.
  getDeviceByIpIface(iface, callback) {
    this.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: '/org/freedesktop/NetworkManager',
      'interface': 'org.freedesktop.NetworkManager',
      member: 'GetDeviceByIpIface',
      signature: 's',
      body: [
        new STRING(iface)
      ]
    }, (err, data) => callback && callback(err, data))
  }

  /**
   * Active a exist Connection(setting)
   * @param {string} connObjPath - setting object path
   * @param {string} device - device object path
   * @param {string} specific_object - accesspoint object path 
   * @param {*} callback 
   */
  ActivateConnection(connObjPath, device, specific_object, callback) {
    this.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: '/org/freedesktop/NetworkManager',
      'interface': 'org.freedesktop.NetworkManager',
      member: 'ActivateConnection',
      signature: 'ooo',
      body: [
        new OBJECT_PATH(connObjPath),
        new OBJECT_PATH(device),
        new OBJECT_PATH(specific_object)
      ]
    }, (err, data) => callback && callback(err, data))
  }

  // add connection
  /**
   * @param {string} Ssid - wifi ssid
   * @param {pwd} pwd - wifi password
   * @param {string} device - device object path
   * @param {string} specific_object - accesspoint object path 
   * @param {*} callback 
   */
  AddAndActivateConnection(Ssid, pwd, device, specific_object, callback) {
    let con = new ARRAY('a{sa{sv}}')
    // connection
    let connection = new ARRAY('a{sv}')
    connection.push(new DICT_ENTRY([
      new STRING('type'),
      new VARIANT(new STRING('802-11-wireless'))
    ]))
    connection.push(new DICT_ENTRY([
      new STRING('uuid'),
      new VARIANT(new STRING(UUID.v4()))
    ]))
    connection.push(new DICT_ENTRY([
      new STRING('id'),
      new VARIANT(new STRING(Ssid))
    ]))
    // ipv4
    let ipv4 = new ARRAY('a{sv}')
    ipv4.push(new DICT_ENTRY([
      new STRING('method'),
      new VARIANT(new STRING('auto'))
    ]))
    // ipv6
    let ipv6 = new ARRAY('a{sv}')
    ipv6.push(new DICT_ENTRY([
      new STRING('method'),
      new VARIANT(new STRING('auto'))
    ]))

    //wifi
    let wifi = new ARRAY('a{sv}')
    let ssid = new ARRAY('ay')
    Array.from(Buffer.from(Ssid)).forEach(x => ssid.push(new BYTE(x)))
    wifi.push(new DICT_ENTRY([
      new STRING('mode'),
      new VARIANT(new STRING('infrastructure'))
    ]))
    wifi.push(new DICT_ENTRY([
      new STRING('ssid'),
      new VARIANT(ssid)
    ]))

    // wifi-security
    let wifiSecurity = new ARRAY('a{sv}')
    wifiSecurity.push(new DICT_ENTRY([
      new STRING('auth-alg'),
      new VARIANT(new STRING('open'))
    ]))
    wifiSecurity.push(new DICT_ENTRY([
      new STRING('key-mgmt'),
      new VARIANT(new STRING('wpa-psk'))
    ]))
    wifiSecurity.push(new DICT_ENTRY([
      new STRING('psk'),
      new VARIANT(new STRING(pwd))
    ]))

    con.push(new DICT_ENTRY([
      new STRING('connection'),
      connection
    ]))
    con.push(new DICT_ENTRY([
      new STRING('ipv4'),
      ipv4
    ]))
    con.push(new DICT_ENTRY([
      new STRING('ipv6'),
      ipv6
    ]))
    con.push(new DICT_ENTRY([
      new STRING('802-11-wireless'),
      wifi
    ]))
    con.push(new DICT_ENTRY([
      new STRING('802-11-wireless-security'),
      wifiSecurity
    ]))
    this.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: '/org/freedesktop/NetworkManager',
      'interface': 'org.freedesktop.NetworkManager',
      member: 'AddAndActivateConnection',
      signature: 'a{sa{sv}}oo',
      body:[
        con,
        new OBJECT_PATH(device),
        new OBJECT_PATH(specific_object)
      ]
    }, callback)
  }

  /**
   * List of active connection object paths.
   */
  ActiveConnections(callback) {
    this.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: '/org/freedesktop/NetworkManager',
      'interface': 'org.freedesktop.DBus.Properties',
      member: 'Get',
      signature: 'ss',
      body: [
        new STRING('org.freedesktop.NetworkManager'),
        new STRING('ActiveConnections')
      ]
    }, (err, data) => {
      if (err) return callback(err)
      if (data && data.length == 1 && Array.isArray(data[0].elems) && data[0].elems.length == 2 && Array.isArray(data[0].elems[1].elems)) {
        let elems = data[0].elems[1].elems
        return callback(null, elems.map(x => x.value))
      } else 
        callback(null, [])
    })
  }

  // Get ActiveConnection`s AddressData Propertity
  ActiveConnectionAddressData (objPath, callback) {
    this.Get(objPath, 'org.freedesktop.NetworkManager.Connection.Active', 'Ip4Config', (err, data) => {
      if (err) return callback(Object.assign(err, { code: 'EIPV4'}))
      let ipv4Conf = data[0].elems[1].value // objp
      this.Get(ipv4Conf, 'org.freedesktop.NetworkManager.IP4Config', 'AddressData', (err, data) => {
        if (err) return callback(Object.assign(err, { code: 'EIPV4'}))
        let elems = data[0].elems[1].elems[0].elems
        let addressData = {}

        elems.forEach(x => {
          let name = x.elems[0].value
          let data = x.elems[1].elems[1].value
          addressData[name] = data
        })
        return callback(null, addressData)
      })
    })
  }

  // get a property`s value
  Get(objPath, binterface, bname, callback) {
    this.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: objPath,
      'interface': 'org.freedesktop.DBus.Properties',
      member: 'Get',
      signature: 'ss',
      body: [
        new STRING(binterface),
        new STRING(bname)
      ]
    }, (err, data) => callback && callback(err, data))
  }

  // get all properties`s values
  GetAll(objPath, binterface, callback) {
    this.dbus.driver.invoke({
      destination: 'org.freedesktop.NetworkManager',
      path: objPath,
      'interface': 'org.freedesktop.DBus.Properties',
      member: 'GetAll',
      signature: 's',
      body: [
        new STRING(binterface)
      ]
    }, (err, data) => callback && callback(err, data))
  }

   /**
   * get wireless devices (wifi device)
   * 
   * NM_DEVICE_TYPE_UNKNOWN = 0 unknown device
   * NM_DEVICE_TYPE_GENERIC = 14 generic support for unrecognized device types
   * NM_DEVICE_TYPE_ETHERNET = 1 a wired ethernet device
   * NM_DEVICE_TYPE_WIFI = 2 an 802.11 WiFi device
   * etc.
   * https://developer.gnome.org/NetworkManager/stable/nm-dbus-types.html#NMDeviceType
   */
  getWirelessDevices(callback) {
    this.GetDevices((err, data) => {
      if (err) return callback(err)
      let count = data[0].elems.length
      if (count === 0) return callback(null, [])
      let devices = []
      data[0].elems.forEach(x => {
        this.Get(x.value, 'org.freedesktop.NetworkManager.Device', 'DeviceType', (err, data) => {
          if (!err) {
            // device type
            if (data[0].elems[1].value === 2) {
              devices.push(x.value)
            }
          }
          if (!--count) {
            return callback(null, devices)
          }
        })
      })
    })
  }

  // connect to internet
  connect(ssid, pwd, callback) {
    this.getWirelessDevices((err, devices) => {
      if (err || !devices.length) return callback(Object.assign(err, { code: 'ENODEVICE' }))
      this.getAccessPointsDetails(devices[0], (err, data) => {
        if (err) return callback(err)
        let wa = data.find(x => x.Ssid === ssid)
        if (wa) {
          this.AddAndActivateConnection(wa.Ssid, pwd, devices[0], wa.objectPath, (err, data) => {
            if(err) return callback(Object.assign(err, { code: 'ECONN'}))
            let setting = data[0].value
            let activeConn = data[1].value
            let count = 0
            let handleFunc = m => {
              if (m.member !== 'Updated') return
              this.ActiveConnections((err, data) => {
                if (count >= 3) return
                if (err || !data.find(x => x === activeConn)) {
                  this.removeSignalHandle(setting, handleFunc)
                  return callback(Object.assign(err || new Error('connect failed'), { code: 'ECONN'}))
                }
              })
              if (++count == 3) {
                this.removeSignalHandle(setting, handleFunc)
                this.ActiveConnections((err, data) => {
                  if (err) return callback(err)
                  if (!data.find(x => x === activeConn)) return callback(Object.assign(new Error('connect failed', { code: 'ECONN' })))
                  this.ActiveConnectionAddressData(activeConn, (err, data) => {
                    if(err) return callback(Object.assign(err, { code: 'ECONN'}))
                    callback(null, data)
                  })
                })
              }
            }
            this.addSignalHandle(setting, handleFunc)
          })
        } else {
          return callback(Object.assign(new Error('wifi not found'), { code: 'ENOENT' }))
        }
      })
    })
  }

  connect2 (ssid, pwd, callback) {
    this.getWirelessDevices((err, devices) => {
      if (err || !devices.length) return callback(Object.assign(err, { code: 'ENODEVICE' }))
      this.getAccessPointsDetails(devices[0], (err, data) => {
        if (err) return callback(err)
        let wa = data.find(x => x.Ssid === ssid)
        if (wa) {
          this.setting.AddConnection(wa.Ssid, pwd, (err, data) => {
            if(err) return callback(Object.assign(err, { code: 'ECONN'}))
            let setting = data[0].value
            this.ActivateConnection(setting, devices[0], wa.objectPath, (err, data) => {
              if(err) return callback(Object.assign(err, { code: 'ECONN'}))
              let activeConn = data[0].value
              let count = 0
              let findAddr = (cb) => {
                setTimeout(() => {
                  this.ActiveConnections((err, data) => {
                    if (err) return cb(err)
                    if (!data.find(x => x === activeConn)) return cb(Object.assign(new Error('connect failed', { code: 'ECONN' })))
                    this.ActiveConnectionAddressData(activeConn, cb)
                  })
                }, 2000)
              }
              let h = (err, data) => {
                if (err && ++count < 10) return findAddr(h)
                if(err) return callback(Object.assign(err, { code: 'ECONN'}))
                callback(null, data)
              }
              findAddr(h)
            })
          })
        } else {
          return callback(Object.assign(new Error('wifi not found'), { code: 'ENOENT' }))
        }
      })
    })
  }

  getAccessPointsDetails(device, callback) {
    this.accessPoint.RequestScan(device, err => {
      // ignore err
      this.accessPoint.GetAccessPoints(device, (err, acs) => {
        if (err || !acs.length) return callback(null, [])
        let count = acs.length
        let aps = []
        acs.forEach(x => {
          this.accessPoint.GetAccessPointProperties(x, (err, data) => {
            if (data) aps.push(data)
            if (!--count) {
              return callback(null, aps)
            }
          })
        })
      })
    })
  }

  addressDatas (callback) {
    this.ActiveConnections((err, data) => {
      if (err || !data.length) return callback(null, [])
      let count = data.length
      let addresses = []
      data.forEach(x => this.ActiveConnectionAddressData(x, (err, data) => {
        if (!err) addresses.push(data)
        if (--count === 0) return callback(null, addresses)
      }))
    })
  }
}

module.exports = NetworkManager