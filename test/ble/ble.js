const Net = require('./net')
const Bled = require('./bled')

const DEV_PORT = '/dev/ttyACM0'

const initAsync = async () => {
  const net = new Net()
  const nic = await net.initAsync()
  console.log('nic:', nic)
  const bled = new Bled(DEV_PORT)
  const mode = await bled.connectAsync()
  if (mode === 'sbl') return false

  bled.init()
  // mode === 'app'
  bled.heartbeat()

  bled.on('CMD_SCAN', (pack) => {
    console.log('CMD_SCAN', pack)
    net.scan((err, list) => {
      bled.sendMsg(err || list, e => e && console.error('send message via SPS error', e))
    })
  })
  bled.on('CMD_CONN', (pack) => {
    console.log('CMD_CONN', pack)
    net.connect('Xiaomi_123', 'wisnuc123456', (err, res) => {
      bled.sendMsg(err || res, e => e && console.error('send message via SPS error', e))
    })
  })

  const version = await bled.getVersionAsync()
  console.log('BLE Version:', version)
  await bled.setStationIdAsync(Buffer.from('stationid123'))
  // console.log('Update station id success')
  await bled.setStationStatusAsync(0x01)
  // console.log('Update station status success')
  return true
}

initAsync().then((isApp) => {
  if (isApp) {
    console.log('\ninit success!')
  } else process.exit(0)
}).catch((e) => {
  console.log('\ninit failed', e)
  process.exit(1)
})
