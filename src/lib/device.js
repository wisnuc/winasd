const os = require('os')
const net = require('net')
const fs = require('fs')
const path = require('path')
const child = require('child_process')

const Config = require('config')
const UUID = require('uuid')

const deviceNameP = path.join(Config.storage.dirs.device, Config.storage.files.deviceName)

const networkInterface = () => {
  let interfaces = os.networkInterfaces()
    
  let keys = Object.keys(interfaces).filter(k => !!k && k !== 'lo')
  if (!keys.length) return 

  let key = keys.find(k => Array.isArray(interfaces[k]) && interfaces[k].length)
  if (!key) return
  let ipv4 = interfaces[key].find(x => x.family === 'IPv4')
  ipv4.interfaceName = key
  ipv4.speed = 1000 // FIXME:
  try {
    let inet = child.execSync(`iwconfig ${key} | grep ESSID`).toString().split('ESSID:"')
    if (inet.length > 1) {
      ipv4.essid = inet[1].split('" ').shift().trim()
    }
  } catch(e) {}

  return ipv4
}

const deviceName = () => {
  let name = 'Winas'
  try {
    name = fs.readFileSync(deviceNameP).toString().trim()
  } catch(e) {}
  return name
}

const TMPFILE = () => {
  return path.join(Config.storage.dirs.tmpDir, UUID.v4())
}

const setDeviceName = (name, callback) => {
  let tmpfile = TMPFILE()
  name = name && name.length ? name : 'Winas'
  fs.writeFile(tmpfile, name, err => {
    if (err) return callback(err)
    fs.rename(tmpfile, deviceNameP, err => 
      err ? callback(err) 
        : callback(null, null))
  })
}

const hardwareInfo = () => {
  return {
    ecc: 'microchip',
    sn: deviceSN(),
    fingerprint: 'ea3e82ef-8c44-4771-a696-2dd432203345',
    cert: 'f0af3d0c-cea3-401e-9f3a-513d25717c16',
    signer: 'Wisnuc Inc.',
    notBefore: 1543561560133,
    notAfter: 1859180920786,
    bleAddr: 'XXXX:XXXX:XXXX:XXX',
    name: deviceName()
  }
}

const deviceSN = () => {
  let deviceSN 
  try {
    deviceSN = fs.readFileSync(path.join(Config.storage.dirs.certDir, 'deviceSN')).toString().trim()
  } catch(e){
    console.log('*****\ndeviceSN not found\n*****\n')
  }
  return deviceSN
}

module.exports = {
  networkInterface,
  TMPFILE,
  setDeviceName,
  deviceName,
  hardwareInfo
}