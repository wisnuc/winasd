const Concat = (...args) => Buffer.concat(
  args.map(a => Array.isArray(a) ? Concat(...a)
    : Buffer.isBuffer(a) ? a : Number.isInteger(a)
      ? Buffer.from([a]) : Buffer.from(a.toString())))

const Length = v => {
  if (v.length < 128) {
    return Concat(v.length)
  } else {
    let str = v.length.toString(16)
    if (str.length % 2) str = '0' + str
    let buf = Buffer.from(str, 'hex')
    return Concat(buf.length | 0x80, buf)
  }
}

const TLV = (t, ...args) => Concat(t, Length(Concat(...args)), Concat(...args))

const BitString = (unused, ...args) => TLV(0x03, Concat(unused, ...args))

const Integer = buf => TLV(0x02, buf)

const UInteger = buf => buf[0] < 128
  ? Integer(buf)
  : Integer(Buffer.concat([Buffer.alloc(1), buf]))

const Sequence = (...args) => TLV(0x30, ...args)

const Set = (...args) => TLV(0x31, ...args)

const UTF8String = buf => TLV(0x0c, buf)

// number -> number array
const base128 = n => n.toString(2)
  .padStart(Math.ceil(n.toString(2).length / 7) * 7, '0')
  .match(/.{7}/g)
  .map(x => parseInt(x, 2))
  .map((x, i, arr) => i === arr.length - 1 ? x : (x | 0x80))

const ObjectIdentifier = str => TLV(0x06,
  ...str.split('.')
    .map(s => parseInt(s))
    .map((n, i, ns) => {
      if (i === 0) return Buffer.alloc(0)
      else if (i === 1) return Buffer.from([ns[0] * 40 + ns[1]])
      else return Buffer.from(base128(n))
    }))

const ContentInfo = buf => TLV(0xa0, buf)

const CertificationRequestInfo = (o, cn, key) =>
  Sequence(
    Integer(Buffer.alloc(1)),
    Sequence(
      Set(
        Sequence(
          ObjectIdentifier('2.5.4.10'),
          UTF8String(o))),
      Set(
        Sequence(
          ObjectIdentifier('2.5.4.3'),
          UTF8String(cn)))),
    Sequence(
      Sequence(
        ObjectIdentifier('1.2.840.10045.2.1'),
        ObjectIdentifier('1.2.840.10045.3.1.7')),
      BitString(0, 0x04, key)),
    ContentInfo(
      Sequence(
        ObjectIdentifier('1.2.840.113549.1.9.14'),
        Set(Sequence(Buffer.alloc(0))))))

// DER format is used in Certificate Verify in TLS 1.2 handshake
const Signature = sig => 
  Sequence(
    UInteger(sig.slice(0, 32)), 
    UInteger(sig.slice(32, 64)))

const CertificationRequest = (cri, sig) =>
  Sequence(
    cri,
    Sequence(
      ObjectIdentifier('1.2.840.10045.4.3.2')),
    BitString(0, 
      Signature(sig)))

module.exports = {
  Concat,
  BitString,
  Integer,
  UInteger,
  UTF8String,
  ObjectIdentifier,
  ContentInfo,
  Sequence,
  Set,
  CertificationRequestInfo,
  Signature,
  CertificationRequest
}
