const child = require('child_process')
const { createHash, randomFillSync } = require('crypto')
const commands = require('./commands')
const { abel } = require('./config')
const { CertificationRequestInfo, CertificationRequest } = require('./csr')

const KEYTYPE_ECC = 4

const I2C_ADDRESS = 16
const SLOT_CONFIG = 20
const COUNTER_0 = 52
const USER_EXTRA = 84
const LOCK_VALUE = 86
const LOCK_CONFIG = 87
const SLOT_LOCKED = 88
const X509_FORMAT = 92
const KEY_CONFIG = 96

const revMap = new Map([
  [Buffer.from([0x00, 0x00, 0x60, 0x01]).readUInt32BE(), '608'],
  [Buffer.from([0x00, 0x00, 0x60, 0x02]).readUInt32BE(), '608'],
  [Buffer.from([0x00, 0x00, 0x50, 0x00]).readUInt32BE(), '508']
])

class ECC {
  constructor (bus) {
    this.bus = bus
  }

  scan (callback) {
    this.bus.scan(0x00, 0x7f, (err, addrs) => {
      if (err) return callback(err)
      if (addrs.includes(0xC0 >> 1)) {
        this.addr = 0xC0
        callback(null)
      } else {
        let err = new Error('not found')
        err.code = 'ENOENT'
        callback(err)
      }
    })
  }

  close (callback) {
    this.bus.close(err => callback && callback(err))
  }

  async chipStatusAsync () {
    let cfg = await this.readConfigZoneAsync()

    let sn = Buffer.concat([cfg.slice(0, 4), cfg.slice(8, 13)]).toString('hex')
    let rev = cfg.slice(4, 8)
    let type = revMap.get(rev.readUInt32BE())
    let i2cAddr = cfg[16]
    let dataLocked = cfg[86] !== 0x55
    let configLocked = cfg[87] !== 0x55
    let slotLocked = cfg.readUInt16LE(88)

    let slots = []
    for (let i = 0; i < 16; i++) {
      let slotConfig = cfg.readUInt16LE(20 + i * 2)
      let keyConfig = cfg.readUInt16LE(96 + i * 2)
      let slot = {}

      slot.isPrivate = !!(keyConfig & 1)
      slot.pubInfo = !!(keyConfig & (1 << 2))
      slot.keyType = (keyConfig >> 2) & 0x07
      slot.lockable = !!(keyConfig & (1 << 5))
      slot.reqRandom = !!(keyConfig & (1 << 6))
      slot.reqAuth = !!(keyConfig & (1 << 7))
      slot.authKey = (keyConfig >> 8) & 0x0f

      slot.readKey = slotConfig & 0x0f
      slot.noMac = !!(slotConfig & (1 << 4))
      slot.limitedUse = !!(slotConfig & (1 << 5))
      slot.encryptedRead = !!(slotConfig & (1 << 6))
      slot.isSecret = !!(slotConfig & (1 << 7))
      slot.writeKey = (slotConfig >> 8) & 0x0f
      slot.writeConfig = (slotConfig >> 12) & 0x0f

      if (slot.keyType === KEYTYPE_ECC) {
        if (slot.isPrivate) {
          slot.keyValid = await this.keyValidAsync(i)
        } else {
          // for public key in slots where PubInfo is zero, the information
          // returned by this command is not useful
          if (slot.pubInfo) slot.keyValid = await this.keyValidAsync(i)
        }
      }

      slot.locked = !(slotLocked & (1 << i))
      slots.push(slot)
    }

    return { sn, type, i2cAddr, dataLocked, configLocked, slots }
  }

  chipStatus (callback) {
    this.chipStatusAsync().then(x => callback(null, x)).catch(e => callback(e))
  }

  /**
  1,  read config
  2,  check config locked
  3,  if not, locked config
  4,  gen key (0, 6, 7)
  5,  check validity and lock
  6.  lock 0, 6, 7
  */
  async presetAsync () {
    // step 1. check config
    let config = await this.readConfigZoneAsync()

    this.sn = Buffer.concat([config.slice(0, 4), config.slice(8, 13)]).toString('hex')
    this.rev = config.slice(4, 8).toString('hex')

    if (config[LOCK_CONFIG] === 0x55) { // unlocked
      let read

      // lock bytes are checked first, if they are not factory value,
      // the chip is considered bad
      // 84 UserExtra, Selector, LockValue, LockConfig, SlotLocked (2), RFU (2)
      // factory value are [00 00 55 55 ff ff 00 00]
      let lockBytes = Buffer.from([0x00, 0x00, 0x55, 0x55, 0xff, 0xff, 0x00, 0x00])
      let lockedBytes = Buffer.from([0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00])

      read = await this.readBytesZoneAsync(0, 0, USER_EXTRA, 8)
      if (!read.equals(lockBytes)) throw new Error('failed')

      const head = abel.slice(I2C_ADDRESS, USER_EXTRA)
      const tail = abel.slice(X509_FORMAT)

      await this.writeBytesZoneAsync(0, 0, I2C_ADDRESS, head)
      read = await this.readBytesZoneAsync(0, 0, I2C_ADDRESS, head.length)
      if (!read.equals(head)) throw new Error('failed')

      await this.writeBytesZoneAsync(0, 0, X509_FORMAT, tail)
      read = await this.readBytesZoneAsync(0, 0, X509_FORMAT, tail.length)
      if (!read.equals(tail)) throw new Error('failed')

      // lock config and data zone
      await this.lockConfigZoneAsync()
      await this.lockDataZoneAsync()

      // re-read config
      config = await this.readConfigZoneAsync()
      let lockedConfig = Buffer.concat([head, lockedBytes, tail])
      if (!config.slice(16).equals(lockedConfig)) throw new Error('failed')
    } else {
      // check compatibility
      let a = config.slice(SLOT_CONFIG, COUNTER_0)
      let b = abel.slice(SLOT_CONFIG, COUNTER_0)
      if (!a.equals(b)) throw new Error('slot config incompatible')

      a = config.slice(KEY_CONFIG, 128)
      b = config.slice(KEY_CONFIG, 128)
      if (!a.equals(b)) throw new Error('key config incompatible')
    }

    // slot must have a valid key and locked
    let slots = [0, 6, 7]
    let keys = []
    for (let i = 0; i < slots.length; i++) {
      let slot = slots[i]
      let valid = await this.keyValidAsync(slot)
      let word = await this.readBytesZoneAsync(0, 0, SLOT_LOCKED, 4)
      let locked = !(word.readUInt16LE() & (1 << slot))

      if (!valid && locked) throw new Error(`slot ${slot} invalid and locked`)

      if (!valid) {
        await this.genKeyAsync(slot)
        valid = await this.keyValidAsync(slot)
        if (!valid) throw new Error('genkey failed')
      }

      if (!locked) {
        await this.lockDataSlotAsync(slot)
        word = await this.readBytesZoneAsync(0, 0, SLOT_LOCKED, 4)
        locked = !(word.readUInt16LE() & (1 << slot))
        if (!locked) throw new Error(`lock slot ${slot} failed`)
      }

      let pubkey = await this.genPubKeyAsync(slot)
      keys.push(pubkey)
    }

    this.keys = keys
  }

  preset (opts, callback) {
    this.presetAsync(opts)
      .then(x => callback(null, x))
      .catch(e => callback(e))
  }

  async serialNumberAsync () {
    let read = await this.readBytesZoneAsync(0, 0, 0, 12)
    return Buffer.concat([read.slice(0, 4), read.slice(8)]).toString('hex')
  }

  serialNumber(opt, callback) {
    this.serialNumberAsync(opt)
      .then(x => callback(null, x))
      .catch(e => callback(e))
  }

  async generateCsrAsync (opts) {
    if (typeof opts !== 'object' || !opts) throw new Error('bad option')

    let { o, cn, slot } = opts
    if (typeof o !== 'string' || !o.length || o.length > 64) {
      throw new Error('bad o name')
    } else if (typeof cn !== 'string' || !cn.length || cn.length > 64) {
      throw new Error('bad cn name')
    }

    if (![0, 6, 7].includes(slot)) slot = 0

    let key = this.keys[slot]
    let cri = CertificationRequestInfo(o, cn, key)
    let digest = createHash('sha256').update(cri).digest()
    let sig = await this.signAsync(slot, digest)
    if (sig.length !== 64) throw new Error('bad signature')

    let verified = await this.verifyExternAsync(digest, sig, key)
    if (!verified) throw new Error('verify failed')

    let csr = CertificationRequest(cri, sig)

    // verify csr and extract public key using openssl
    let keyPEM = await new Promise((resolve, reject) => {
      let cmd = 'openssl req -verify -inform der -noout -pubkey'
      let c = child.exec(cmd, (err, stdout, stderr) => {
        if (err) {
          reject(err)
        } else if (stderr.trim() !== 'verify OK') {
          let err = new Error(`openssl: ${stderr}`)
          err.code = 'EOPENSSL'
          reject(err)
        } else {
          resolve(stdout)
        }
      })
      c.stdin.write(csr)
      c.stdin.end()
    })

    let b64 = keyPEM
      .split('\n')
      .filter(x => !!x && !x.startsWith('--'))
      .join('')

    let ber = Buffer.from(b64, 'base64')
    if (!ber.slice(ber.length - 64).equals(key)) throw new Error('pubkey mismatch')
    return csr
  }

  sign (opts, callback) {
    let keyId = opts.keyId || 0
    let data = opts.data
    let digest = createHash('sha256').update(data).digest()
    this.signAsync(keyId, digest)
      .then(sig => callback(null, sig))
      .catch(e => callback(e))
  }

  verify(opts, callback) {
    let pubKey = opts.pubKey || this.keys[0]
    let digest = createHash('sha256').update(opts.data).digest()
    this.verifyExternAsync(digest, opts.signature, pubKey)
      .then(x => callback(null, x))
      .catch(e => callback(e))
  }

  genCsr (opts, callback) {
    this.generateCsrAsync(opts)
      .then(csr => callback(null, csr))
      .catch(e => callback(e))
  }
}

Object.assign(ECC.prototype, commands)

module.exports = ECC
