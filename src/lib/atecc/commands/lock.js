const ATCA_LOCK = 0x17 // Lock command op-code
const ATCA_CMD_SIZE_MIN = 7

// const LOCK_ZONE_IDX = ATCA_PARAM1_IDX // Lock command index for zone
// const LOCK_SUMMARY_IDX = ATCA_PARAM2_IDX // Lock command index for summary
const LOCK_COUNT = ATCA_CMD_SIZE_MIN // Lock command packet size
const LOCK_ZONE_CONFIG = 0x00 // Lock zone is Config
const LOCK_ZONE_DATA = 0x01 // Lock zone is OTP or Data
const LOCK_ZONE_DATA_SLOT = 0x02 // Lock slot of Data
const LOCK_ZONE_NO_CRC = 0x80 // Lock command: Ignore summary.
const LOCK_ZONE_MASK = (0xBF) // Lock parameter 1 bits 6 are 0.
const ATCA_UNLOCKED = (0x55) // Value indicating an unlocked zone
const ATCA_LOCKED = (0x00) // Value indicating a locked zone
// const LOCK_RSP_SIZE = ATCA_RSP_SIZE_MIN // Lock command response packet size

const Packet = (mode, crc) => ({
  txsize: LOCK_COUNT,
  opcode: ATCA_LOCK,
  param1: mode,
  param2: crc
  // rxsize: LOCK_RSP_SIZE
})

module.exports = {

  async lockConfigZoneAsync () {
    return this.execAsync(Packet(LOCK_ZONE_NO_CRC | LOCK_ZONE_CONFIG, 0))
  },

  async lockConfigZoneCrcAsync (crc) {
    return this.execAsync(Packet(LOCK_ZONE_CONFIG, crc))
  },

  async lockDataZoneAsync () {
    return this.execAsync(Packet(LOCK_ZONE_NO_CRC | LOCK_ZONE_DATA, 0))
  },

  async lockDataZoneCrcAsync (crc) {
    return this.execAsync(Packet(LOCK_ZONE_DATA, crc))
  },

  async lockDataSlotAsync (slot) {
    return this.execAsync(Packet(slot << 2 | LOCK_ZONE_DATA_SLOT, 0))
  }
}
