const ATCA_RANDOM = 0x1B // Random command op-code
const ATCA_CMD_SIZE_MIN = 7

// const RANDOM_MODE_IDX = ATCA_PARAM1_IDX // Random command index for mode
// const RANDOM_PARAM2_IDX = ATCA_PARAM2_IDX // Random command index for 2. parameter
const RANDOM_COUNT = ATCA_CMD_SIZE_MIN // Random command packet size
const RANDOM_SEED_UPDATE = 0x00 // Random mode for automatic seed update
const RANDOM_NO_SEED_UPDATE = 0x01 // Random mode for no seed update
const RANDOM_NUM_SIZE = 32 // Number of bytes in the data packet of a random command
// const RANDOM_RSP_SIZE = ATCA_RSP_SIZE_32 // Random command response packet size

module.exports = {

  async randomAsync () {
    return this.execAsync({
      txsize: RANDOM_COUNT,
      opcode: ATCA_RANDOM,
      param1: RANDOM_SEED_UPDATE,
      param2: 0
      // rxsize: RANDOM_RSP_SIZE
    })
  }

}
