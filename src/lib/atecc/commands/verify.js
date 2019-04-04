const ATCA_VERIFY = 0x45 // GenKey command op-code

const ATCA_RSP_SIZE_MIN = 4 // minimum number of bytes in response
const ATCA_RSP_SIZE_4 = 7 // size of response packet containing 4 bytes data
const ATCA_RSP_SIZE_72 = 75 // size of response packet containing 64 bytes data
const ATCA_RSP_SIZE_64 = 67 // size of response packet containing 64 bytes data
const ATCA_RSP_SIZE_32 = 35 // size of response packet containing 32 bytes data
const ATCA_RSP_SIZE_16 = 19 // size of response packet containing 16 bytes data
const ATCA_RSP_SIZE_MAX = 75 // maximum size of response packet (GenKey and Verify command)

// const VERIFY_MODE_IDX = ATCA_PARAM1_IDX // Verify command index for mode
// const VERIFY_KEYID_IDX = ATCA_PARAM2_IDX // Verify command index for key id
const VERIFY_DATA_IDX = (5) // Verify command index for data
const VERIFY_256_STORED_COUNT = (71) // Verify command packet size for 256-bit key in stored mode
const VERIFY_283_STORED_COUNT = (79) // Verify command packet size for 283-bit key in stored mode
const VERIFY_256_VALIDATE_COUNT = (90) // Verify command packet size for 256-bit key in validate mode
const VERIFY_283_VALIDATE_COUNT = (98) // Verify command packet size for 283-bit key in validate mode
const VERIFY_256_EXTERNAL_COUNT = (135) // Verify command packet size for 256-bit key in external mode
const VERIFY_283_EXTERNAL_COUNT = (151) // Verify command packet size for 283-bit key in external mode
const VERIFY_256_KEY_SIZE = (64) // Verify key size for 256-bit key
const VERIFY_283_KEY_SIZE = (72) // Verify key size for 283-bit key
const VERIFY_256_SIGNATURE_SIZE = (64) // Verify signature size for 256-bit key
const VERIFY_283_SIGNATURE_SIZE = (72) // Verify signature size for 283-bit key
const VERIFY_OTHER_DATA_SIZE = (19) // Verify size of "other data"
const VERIFY_MODE_MASK = 0x03 // Verify mode bits 2 to 7 are 0
const VERIFY_MODE_STORED = 0x00 // Verify mode: stored
const VERIFY_MODE_VALIDATE_EXTERNAL = 0x01 // Verify mode: validate external
const VERIFY_MODE_EXTERNAL = 0x02 // Verify mode: external
const VERIFY_MODE_VALIDATE = 0x03 // Verify mode: validate
const VERIFY_MODE_INVALIDATE = 0x07 // Verify mode: invalidate
const VERIFY_MODE_SOURCE_MASK = 0x20 // Verify mode message source mask
const VERIFY_MODE_SOURCE_TEMPKEY = 0x00 // Verify mode message source is TempKey
const VERIFY_MODE_SOURCE_MSGDIGBUF = 0x20 // Verify mode message source is the Message Digest Buffer
const VERIFY_MODE_MAC_FLAG = 0x80 // Verify mode: MAC
const VERIFY_KEY_B283 = 0x0000 // Verify key type: B283
const VERIFY_KEY_K283 = 0x0001 // Verify key type: K283
const VERIFY_KEY_P256 = 0x0004 // Verify key type: P256
const VERIFY_RSP_SIZE = ATCA_RSP_SIZE_MIN // Verify command response packet size
const VERIFY_RSP_SIZE_MAC = ATCA_RSP_SIZE_32 // Verify command response packet size with validating MAC

const Packet = (mode, keyId, signature, pubKey, otherData) => {
  let data, txsize, rxsize

  let verifyMode = mode & VERIFY_MODE_MASK
  if (verifyMode === VERIFY_MODE_EXTERNAL) {
    data = Buffer.concat([signature, pubKey])
  } else if (otherData) {
    data = Buffer.concat([signature, otherData])
  }

  switch (mode & VERIFY_MODE_MASK) {
    case VERIFY_MODE_STORED:
      txsize = VERIFY_256_STORED_COUNT
      rxsize = (mode & VERIFY_MODE_MAC_FLAG) ? VERIFY_RSP_SIZE_MAC : VERIFY_RSP_SIZE
      break

    case VERIFY_MODE_VALIDATE_EXTERNAL:
      txsize = VERIFY_256_EXTERNAL_COUNT
      rxsize = VERIFY_RSP_SIZE
      break

    case VERIFY_MODE_EXTERNAL:
      txsize = VERIFY_256_EXTERNAL_COUNT
      rxsize = (mode & VERIFY_MODE_MAC_FLAG) ? VERIFY_RSP_SIZE_MAC : VERIFY_RSP_SIZE
      break

    case VERIFY_MODE_VALIDATE:
    case VERIFY_MODE_INVALIDATE:
      txsize = VERIFY_256_VALIDATE_COUNT
      rxsize = VERIFY_RSP_SIZE
      break

    default:
      throw new Error('bad param')
  }

  return {
    txsize,
    opcode: ATCA_VERIFY,
    param1: mode,
    param2: keyId,
    data
  }
}

module.exports = {

  async verifyAsync (mode, keyId, signature, pubKey, otherData) {
    return this.execAsync(Packet(mode, keyId, signature, pubKey, otherData))
  },

  /**
  return true if success, false if miscompare.
  throw error if sha256, signature, or key invalid.
  Not all 64-byte data are valid ecc public key.
  try this function with a valid but wrong ecc key and a random filled 64 byte data.
  the former will throw ECC_MISCOMPARE and the later will throw ECC_EXECUTION
  */
  async verifyExternAsync (sha256, signature, pubKey) {
    await this.nonceAsync(sha256)
    try {
      let r = await this.execAsync(
        Packet(VERIFY_MODE_EXTERNAL, VERIFY_KEY_P256, signature, pubKey))
      if (r === undefined) {
        return true
      } else {
        throw new Error(`unexpect return: ${r.toString()}`)
      }
    } catch (e) {
      if (e.code === 'ECC_MISCOMPARE') {
        return false
      } else {
        throw e
      }
    }
  }

}
