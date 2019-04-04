/** \name Definitions for Zone and Address Parameters @{ */
const ATCA_ZONE_CONFIG = 0x00 // Configuration zone
const ATCA_ZONE_OTP = 0x01 // OTP (One Time Programming) zone
const ATCA_ZONE_DATA = 0x02 // Data zone
const ATCA_ZONE_MASK = 0x03 // Zone mask
const ATCA_ZONE_ENCRYPTED = 0x40 // Zone bit 6 set: Write is encrypted with an unlocked data zone.
const ATCA_ZONE_READWRITE_32 = 0x80 // Zone bit 7 set: Access 32 bytes, otherwise 4 bytes.
const ATCA_ADDRESS_MASK_CONFIG = (0x001F) // Address bits 5 to 7 are 0 for Configuration zone.
const ATCA_ADDRESS_MASK_OTP = (0x000F) // Address bits 4 to 7 are 0 for OTP zone.
const ATCA_ADDRESS_MASK = (0x007F) // Address bit 7 to 15 are always 0.
const ATCA_TEMPKEY_KEYID = (0xFFFF) // KeyID when referencing TempKey

const getAddr = (zone, slot, block, offset) => {
  switch (zone & 0x03) {
    case ATCA_ZONE_CONFIG:
    case ATCA_ZONE_OTP:
      return (block << 3) | (offset & 0x07)
    case ATCA_ZONE_DATA:
      return (slot << 3) | (offset & 0x07) | (block << 8)
    default:
      throw new Error('invalid zone')
  }
}

const getZoneSize = (zone, slot) => {
  switch (zone) {
    case ATCA_ZONE_CONFIG:
      return 128
    case ATCA_ZONE_OTP:
      return 64
    case ATCA_ZONE_DATA:
      if (slot < 8) {
        return 36
      } else if (slot === 8) {
        return 416
      } else if (slot < 16) {
        return 72
      } else {
        throw new Error('bad param')
      }
    default:
      throw new Error('bad param')
  }
}

module.exports = {
  getAddr,
  getZoneSize
}
