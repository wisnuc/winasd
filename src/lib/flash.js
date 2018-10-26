const Promise = require('bluebird')
const fs = Promise.promisifyAll(require('fs'))
const SerialPort = require('serialport')

/* Serial Bus Commands from swcu117h.pdf */
const COMMAND_CONNECT = 0x55
const COMMAND_PING = 0x20
const COMMAND_DOWNLOAD = 0x21
const COMMAND_GET_STATUS = 0x23
const COMMAND_SEND_DATA = 0x24
const COMMAND_RESET = 0x25
const COMMAND_GET_CHIP_ID = 0x28
const COMMAND_BANK_ERASE = 0x2C
const COMMAND_SET_CCFG = 0x2D
const COMMAND_MEMORY_READ = 0x2A
const ACK_BYTE = [0x00, 0xCC]

/* TODO */
const DEV_PORT = '/dev/ttyACM0'
const INPUT_BIN = './ble.bin'

const port = new SerialPort(DEV_PORT, {
  baudRate: 115200
})

const sendAck = (cb) => {
  port.write(Buffer.from(ACK_BYTE), cb)
}

const sendAckAsync = Promise.promisify(sendAck)

/* send cmd to SBL */
const write = (msg, cb) => {
  const timer = setTimeout(() => {
    port.removeAllListeners('data')
    console.log('timeout write', msg)
    const e = new Error('ETIMEOUT')
    cb(e)
  }, 2000)

  port.once('data', (data) => {
    clearTimeout(timer)
    if (data.toString('hex') === Buffer.from(ACK_BYTE).toString('hex')) {
      // console.log('receive ack byte')
    } else if (data[data.length - 1] === 0x44) {
      console.log('COMMAND_RET_FLASH_FAIL')
    } else if (data[data.length - 1] === 0x40) {
      // console.log('COMMAND_RET_SUCCESS')
    } else {
      console.log('not ack byte: ', data)
      const e = new Error('ENOTACK')
      cb(e)
      return
    }
    cb(null)
  })

  port.write(msg, (err) => {
    if (err) {
      console.log('Error on write: ', err.message)
      cb(err)
    } else {
      // console.log('message written: ', msg)
    }
  })
}

const writeAsync = Promise.promisify(write)

const cmdPing = async () => {
  await writeAsync(Buffer.from([0x03, COMMAND_PING, COMMAND_PING]))
}

const cmdErase = async () => {
  await writeAsync(Buffer.from([0x03, COMMAND_BANK_ERASE, COMMAND_BANK_ERASE]))
}

const cmdReset = async () => {
  await writeAsync(Buffer.from([0x03, COMMAND_RESET, COMMAND_RESET]))
}

const cmdConnect = async () => {
  await writeAsync(Buffer.from([COMMAND_CONNECT, COMMAND_CONNECT]))
}

/* cmdStatus and cmdChipId need send extra ack byte */
const cmdStatus = async () => {
  await writeAsync(Buffer.from([0x03, COMMAND_GET_STATUS, COMMAND_GET_STATUS]))
  await sendAckAsync()
}

const cmdChipId = async () => {
  await writeAsync(Buffer.from([0x03, COMMAND_GET_CHIP_ID, COMMAND_GET_CHIP_ID]))
  await sendAckAsync()
}

/* calculate checksum */
const checksum = (arr) => {
  let sum = 0x00
  arr.forEach(a => (sum += a))
  return sum % 256
}

/* Read data by address */
const cmdRead = async (addr, len) => {
  const buf = Buffer.alloc(9)
  buf[0] = 0x09
  buf[2] = COMMAND_MEMORY_READ
  buf.writeUInt32BE(addr, 3)
  buf[7] = 0x01
  buf[8] = len
  buf[1] = checksum(buf.slice(2, 9))
  await writeAsync(buf)
  await sendAckAsync()
}

/* Prepares flash programming */
const cmdDownload = async (addr, size) => {
  const buf = Buffer.alloc(11)
  buf[0] = 0x0B
  buf[2] = COMMAND_DOWNLOAD
  buf.writeUInt32BE(addr, 3)
  buf.writeUInt32BE(size, 7)
  buf[1] = checksum(buf.slice(2, 11))
  await writeAsync(buf)
}

/* Transfers data and programs flash */
const cmdSendData = async (addr, data) => {
  const size = data.length
  const buf = Buffer.concat([Buffer.alloc(3), data])
  buf[0] = size + 3
  buf[2] = COMMAND_SEND_DATA
  buf[1] = checksum(buf.slice(2, size + 3))
  process.stdout.clearLine()
  process.stdout.cursorTo(0)
  process.stdout.write(`Write ${size} bytes at ${addr}`)
  await writeAsync(buf)
}

/* send bin by part */
const sendBin = async () => {
  const packageSize = 248
  const bin = await fs.readFileAsync(INPUT_BIN)
  const total = bin.length
  console.log(`Writing ${total} bytes starting at address 0x00000000`)
  for (let i = 0; i < total; i += packageSize) {
    const size = Math.min(packageSize, total - i)
    await cmdDownload(i, size)
    await cmdStatus()
    await cmdSendData(i, bin.slice(i, i + size))
    await cmdStatus()
  }
}

const fireAsync = async () => {
  await cmdConnect()
  await cmdErase()
  await sendBin()
  await cmdReset()
}

fireAsync().then(() => {
  console.log('\ndone!')
  process.exit(0)
}).catch((e) => {
  console.log('error', e)
  process.exit(1)
})
