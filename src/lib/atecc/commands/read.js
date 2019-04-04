const { getAddr, getZoneSize } = require('./common')

const ATCA_ZONE_CONFIG = 0x00 // Configuration zone
const ATCA_ZONE_DATA = 0x02 // Data zone

const ATCA_ECC_CONFIG_SIZE = (128) // size of configuration zone

const ATCA_CMD_SIZE_MIN = 7
// Read command packet size
const READ_COUNT = ATCA_CMD_SIZE_MIN
// Read command op-code
const ATCA_READ = 0x02
// Zone bit 7 set: Access 32 bytes, otherwise 4 bytes.
const ATCA_ZONE_READWRITE_32 = 0x80

module.exports = {
  async readZoneAsync (zone, slot, block, offset, len) {
    return this.execAsync({
      txsize: READ_COUNT,
      opcode: ATCA_READ,
      param1: len === 32 ? (zone | ATCA_ZONE_READWRITE_32) : zone,
      param2: getAddr(zone, slot, block, offset)
    })
  },

  async readBytesZoneAsync (zone, slot, offset, length) {
    let zoneSize = 0
    let dataIdx = 0
    let curBlock = 0
    let curOffset = 0
    let readSize = 32
    let readBufIdx = 0
    let copyLength = 0
    let readOffset = 0
    let blocks = []

    if (![0, 1, 2].includes(zone) || (zone === ATCA_ZONE_DATA && slot > 15)) { throw new Error('bad param') }

    if (length === 0) return Buffer.alloc(0)

    zoneSize = getZoneSize(zone, slot)
    if ((offset + length) > zoneSize) throw new Error('ATCA_BAD_PARAM')

    curBlock = Math.floor(offset / 32)
    while (dataIdx < length) {
      if (readSize === 32 && zoneSize - curBlock * 32 < 32) {
        // We have less than a block to read and
        // can't read past the end of the zone, switch to word reads
        readSize = 4
        curOffset = Math.floor((dataIdx + offset) / 4) % (32 / 4)
      }

      let buf = await this.readZoneAsync(zone, slot, curBlock, curOffset, readSize)

      readOffset = curBlock * 32 + curOffset * 4
      if (readOffset < offset) {
        readBufIdx = offset - readOffset
      } else {
        readBufIdx = 0
      }

      readBufIdx = readOffset < offset ? offset - readOffset : 0
      if (length - dataIdx < readSize - readBufIdx) {
        copyLength = length - dataIdx
      } else {
        copyLength = readSize - readBufIdx
      }

      blocks.push(buf.slice(readBufIdx, readBufIdx + copyLength))

      dataIdx += copyLength
      if (readSize === 32) {
        curBlock += 1
      } else {
        curOffset += 1
      }
    }

    return Buffer.concat(blocks)
  },

  async readConfigZoneAsync () {
    return this.readBytesZoneAsync(ATCA_ZONE_CONFIG, 0, 0x00, ATCA_ECC_CONFIG_SIZE)
  }
}
