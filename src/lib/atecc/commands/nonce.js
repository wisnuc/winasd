// const NONCE_MODE_IDX = ATCA_PARAM1_IDX // Nonce command index for mode
const ATCA_CMD_SIZE_MIN = 7
const ATCA_NONCE = 0x16 // Nonce command op-code

const ATCA_RSP_SIZE_MIN = 4 // minimum number of bytes in response
const ATCA_RSP_SIZE_32 = 35 // size of response packet containing 32 bytes data

// const NONCE_PARAM2_IDX = ATCA_PARAM2_IDX // Nonce command index for 2. parameter
// const NONCE_INPUT_IDX = ATCA_DATA_IDX // Nonce command index for input data
const NONCE_COUNT_SHORT = (ATCA_CMD_SIZE_MIN + 20) // Nonce command packet size for 20 bytes of NumIn
const NONCE_COUNT_LONG = (ATCA_CMD_SIZE_MIN + 32) // Nonce command packet size for 32 bytes of NumIn
const NONCE_COUNT_LONG_64 = (ATCA_CMD_SIZE_MIN + 64) // Nonce command packet size for 64 bytes of NumIn
const NONCE_MODE_MASK = 0x03 // Nonce mode bits 2 to 7 are 0.
const NONCE_MODE_SEED_UPDATE = 0x00 // Nonce mode: update seed
const NONCE_MODE_NO_SEED_UPDATE = 0x01 // Nonce mode: do not update seed
const NONCE_MODE_INVALID = 0x02 // Nonce mode 2 is invalid.
const NONCE_MODE_PASSTHROUGH = 0x03 // Nonce mode: pass-through

const NONCE_MODE_INPUT_LEN_MASK = 0x20 // Nonce mode: input size mask
const NONCE_MODE_INPUT_LEN_32 = 0x00 // Nonce mode: input size is 32 bytes
const NONCE_MODE_INPUT_LEN_64 = 0x20 // Nonce mode: input size is 64 bytes

const NONCE_MODE_TARGET_MASK = 0xC0 // Nonce mode: target mask
const NONCE_MODE_TARGET_TEMPKEY = 0x00 // Nonce mode: target is TempKey
const NONCE_MODE_TARGET_MSGDIGBUF = 0x40 // Nonce mode: target is Message Digest Buffer
const NONCE_MODE_TARGET_ALTKEYBUF = 0x80 // Nonce mode: target is Alternate Key Buffer

const NONCE_ZERO_CALC_MASK = 0x8000 // Nonce zero (param2): calculation mode mask
const NONCE_ZERO_CALC_RANDOM = 0x0000 // Nonce zero (param2): calculation mode random, use RNG in calculation and return RNG output
const NONCE_ZERO_CALC_TEMPKEY = 0x8000 // Nonce zero (param2): calculation mode TempKey, use TempKey in calculation and return new TempKey value

const NONCE_NUMIN_SIZE = (20) // Nonce NumIn size for random modes
const NONCE_NUMIN_SIZE_PASSTHROUGH = (32) // Nonce NumIn size for 32-byte pass-through mode

const NONCE_RSP_SIZE_SHORT = ATCA_RSP_SIZE_MIN // Nonce command response packet size with no output
const NONCE_RSP_SIZE_LONG = ATCA_RSP_SIZE_32 // Nonce command response packet size with output

const Packet = (mode, zero, numIn) => {
  let data, txsize, rxsize
  let nonceMode = mode & NONCE_MODE_MASK

  if (nonceMode === NONCE_MODE_SEED_UPDATE || nonceMode === NONCE_MODE_NO_SEED_UPDATE) {
    data = numIn.slice(0, NONCE_NUMIN_SIZE)
  } else if (nonceMode === NONCE_MODE_PASSTHROUGH) {
    if ((mode & NONCE_MODE_INPUT_LEN_MASK) === NONCE_MODE_INPUT_LEN_64) {
      data = numIn.slice(0, 64)
    } else {
      data = numIn.slice(0, 32)
    }
  } else {
    throw new Error('bad param')
  }

  // atNonce

  let calcMode = mode & NONCE_MODE_MASK
  if (calcMode === NONCE_MODE_SEED_UPDATE || nonceMode === NONCE_MODE_NO_SEED_UPDATE) {
    txsize = NONCE_COUNT_SHORT
    rxsize = NONCE_RSP_SIZE_LONG
  } else if (calcMode === NONCE_MODE_PASSTHROUGH) {
    if ((mode & NONCE_MODE_INPUT_LEN_MASK) === NONCE_MODE_INPUT_LEN_64) {
      txsize = NONCE_COUNT_LONG_64
    } else {
      txsize = NONCE_COUNT_LONG
    }
    rxsize = NONCE_RSP_SIZE_SHORT
  }

  return {
    txsize,
    opcode: ATCA_NONCE,
    param1: mode,
    param2: zero,
    data,
    rxsize
  }
}

module.exports = {

  async nonceAsync (numIn) {
    return this.execAsync(Packet(NONCE_MODE_PASSTHROUGH, 0, numIn))
  },

  async nonceLoadAsync (target, numIn) {
    let mode = NONCE_MODE_PASSTHROUGH | (NONCE_MODE_TARGET_MASK & target)

    if (numIn.length === 32) {
      mode |= NONCE_MODE_INPUT_LEN_32
    } else if (numIn.length === 64) {
      mode |= NONCE_MODE_INPUT_LEN_64
    } else {
      throw new Error('bad param')
    }

    return this.execAsync(Packet(mode, 0, numIn))
  },

  async nonceRandAsync (numIn) {
    return this.execAsync(Packet(NONCE_MODE_SEED_UPDATE, 0, numIn))
  },

  // alias ???
  async nonceChallenge (numIn) {
    return this.nonceAsync(numIn)
  },

  async nonceChallengeSeedUpdate (numIn) {
    return this.nonceAsync(Packet(NONCE_MODE_SEED_UPDATE, 0, numIn))
  }

}
