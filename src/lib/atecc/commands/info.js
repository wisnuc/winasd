const ATCA_INFO = 0x30 // Info command op-code
const ATCA_CMD_SIZE_MIN = 7

// const INFO_PARAM1_IDX = ATCA_PARAM1_IDX // Info command index for 1. parameter
// const INFO_PARAM2_IDX = ATCA_PARAM2_IDX // Info command index for 2. parameter
const INFO_COUNT = ATCA_CMD_SIZE_MIN // Info command packet size
const INFO_MODE_REVISION = 0x00 // Info mode Revision
const INFO_MODE_KEY_VALID = 0x01 // Info mode KeyValid
const INFO_MODE_STATE = 0x02 // Info mode State
const INFO_MODE_GPIO = 0x03 // Info mode GPIO
const INFO_MODE_VOL_KEY_PERMIT = 0x04 // Info mode GPIO
const INFO_MODE_MAX = 0x03 // Info mode maximum value
const INFO_NO_STATE = 0x00 // Info mode is not the state mode.
const INFO_OUTPUT_STATE_MASK = 0x01 // Info output state mask
const INFO_DRIVER_STATE_MASK = 0x02 // Info driver state mask
const INFO_PARAM2_SET_LATCH_STATE = 0x0002 // Info param2 to set the persistent latch state.
const INFO_PARAM2_LATCH_SET = 0x0001 // Info param2 to set the persistent latch
const INFO_PARAM2_LATCH_CLEAR = 0x0000 // Info param2 to clear the persistent latch
const INFO_SIZE = 0x04 // Info return size
// const INFO_RSP_SIZE = ATCA_RSP_SIZE_VAL // Info command response packet size

const Packet = (mode, param2) => ({
  txsize: INFO_COUNT,
  opcode: ATCA_INFO,
  param1: mode,
  param2: param2
//  rxsize: INFO_RSP_SIZE
})

module.exports = {

  async revisionAsync () {
    return this.execAsync(Packet(INFO_MODE_REVISION, 0))
  },

  async keyValidAsync (slot) {
    let r = await this.execAsync(Packet(INFO_MODE_KEY_VALID, slot))
    return !!r[0]
  },

  async stateInfoAsync () {
    let r = await this.execAsync(Packet(INFO_MODE_STATE))
    return {
      bytes: r,
      TempKey: {
        NoMacFlag: !!(r[0] & 0x80),
        GenKeyData: !!(r[0] & 0x40),
        GenDigData: !!(r[0] & 0x20),
        SourceFlag: !!(r[0] & 0x10),
        KeyId: r[0] & 0x0f,
        Valid: !!(r[1] & 0x80)
      },
      AuthKeyId: (r[1] >> 3) & 0x07,
      AuthValid: !!(r[1] & 0x04),
      sRNG: !!(r[1] & 0x02),
      eRNG: !!(r[1] & 0x01)
    }
  },

  async getLatchAsync () {
    return this.execAsync(Packet(INFO_MODE_VOL_KEY_PERMIT, 0))
  },

  async setLatchAsync () {
    //    return this.execAsync(
  }
}
