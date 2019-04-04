const ATCA_CMD_SIZE_MIN = 7
const ATCA_SIGN = 0x41 // Sign command op-code

// const SIGN_MODE_IDX = ATCA_PARAM1_IDX // Sign command index for mode
// const SIGN_KEYID_IDX = ATCA_PARAM2_IDX // Sign command index for key id
const SIGN_COUNT = ATCA_CMD_SIZE_MIN // Sign command packet size
const SIGN_MODE_MASK = 0xE1 // Sign mode bits 1 to 4 are 0
const SIGN_MODE_INTERNAL = 0x00 // Sign mode   0: internal
const SIGN_MODE_INVALIDATE = 0x01 // Sign mode bit 1: Signature will be used for Verify(Invalidate)
const SIGN_MODE_INCLUDE_SN = 0x40 // Sign mode bit 6: include serial number
const SIGN_MODE_EXTERNAL = 0x80 // Sign mode bit 7: external
const SIGN_MODE_SOURCE_MASK = 0x20 // Sign mode message source mask
const SIGN_MODE_SOURCE_TEMPKEY = 0x00 // Sign mode message source is TempKey
const SIGN_MODE_SOURCE_MSGDIGBUF = 0x20 // Sign mode message source is the Message Digest Buffer
// const SIGN_RSP_SIZE = ATCA_RSP_SIZE_MAX // Sign command response packet size

const Packet = (mode, keyId) => ({
  txsize: SIGN_COUNT,
  opcode: ATCA_SIGN,
  param1: mode,
  param2: keyId
  // rxsize: ATCA_RSP_SIZE_64
})

module.exports = {

  async signAsync (keyId, digest) {
    if (digest.length !== 32) throw new Error('bad param')
    // update random
    await this.randomAsync()
    // load into TempKey
    await this.nonceAsync(digest)
    return this.execAsync(Packet(SIGN_MODE_EXTERNAL, keyId))
  }

}
