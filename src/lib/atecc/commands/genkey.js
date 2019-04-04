const ATCA_GENKEY = 0x40 // GenKey command op-code
const ATCA_CMD_SIZE_MIN = 7

// GenKey command packet size without "other data"
const GENKEY_COUNT = ATCA_CMD_SIZE_MIN
// GenKey command packet size with "other data"
const GENKEY_COUNT_DATA = (10)
const GENKEY_OTHER_DATA_SIZE = (3) // GenKey size of "other data"
const GENKEY_MODE_MASK = 0x1C // GenKey mode bits 0 to 1 and 5 to 7 are 0
const GENKEY_MODE_PRIVATE = 0x04 // GenKey mode: private key generation
const GENKEY_MODE_PUBLIC = 0x00 // GenKey mode: public key calculation
// GenKey mode: PubKey digest will be created after the public key is calculated
const GENKEY_MODE_DIGEST = 0x08
// GenKey mode: Calculate PubKey digest on the public key in KeyId
const GENKEY_MODE_PUBKEY_DIGEST = 0x10
// GenKey Create private key and store to tempkey (608 only)
const GENKEY_PRIVATE_TO_TEMPKEY = 0xFFFF

const Packet = (mode, keyId, data) => {
  let txsize, rxsize
  if (mode & GENKEY_MODE_PUBKEY_DIGEST) {
    txsize = GENKEY_COUNT_DATA
    // rxsize = GENKEY_RSP_SIZE_SHORT
  } else {
    txsize = GENKEY_COUNT
    // rxsize = GENKEY_RSP_SIZE_LONG
  }

  data = data || Buffer.alloc(0)

  return {
    txsize,
    opcode: ATCA_GENKEY,
    param1: mode,
    param2: keyId,
    data,
    rxsize
  }
}

module.exports = {

  async genKeyBaseAsync (mode, keyId, data) {
    if (data && data.length !== GENKEY_OTHER_DATA_SIZE) throw new Error('bad param')
    return this.execAsync(Packet(mode, keyId, data))
  },

  async genKeyAsync (keyId) {
    return this.genKeyBaseAsync(GENKEY_MODE_PRIVATE, keyId)
  },

  async genPubKeyAsync (keyId) {
    return this.genKeyBaseAsync(GENKEY_MODE_PUBLIC, keyId)
  }
}
