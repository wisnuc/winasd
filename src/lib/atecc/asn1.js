class Anode {
  constructor (parent, buf) {
    this.children = []
    this.parent = parent 
    this.buf = buf

    if (buf.length < 2) throw new Error('invalid buf length')

    this.type = buf[0]
    switch (buf[0]) {
      case 0x02:
        this.type = 'integer'
        break
      case 0x30:
        this.type = 'sequence'
        break
      case 0x31:
        this.type = 'set'
        break
      case 0x0c:
        this.type = 'utf8string'
        break
      case 0x06:
        this.type = 'oid'
        break
      case 0xa0: // context-specific 0x80 | 0x20
        this.type = 'contentInfo'
        break
      default:
        throw new Error('unrecognized type')
    }

    if (buf[1] < 128) { // single byte length
      this.length = buf[1]
      this.value = buf.slice(2, 2 + this.length) 
      this.remainder = buf.slice(2 + this.length)
    } else if (buf[1] === 128) {
      throw new Error('indefinite-length not supported')
    } else { // limited to 4 byte
      let lengthLength = buf[1] & 0x7f
      if (lengthLength === 0) throw new Error('zero length length')
      if (lengthLength > 4) throw new Error('too lengthy')
      let lbuf = buf.slice(2, lengthLength)
      lbuf = Buffer.concat(Buffer.alloc(4 - lbuf.length), lbuf)
      this.length = lbuf.readUInt32BE(lbuf)
      this.value = buf.slice(2 + lengthLength, 2 + lengthLength + this.length) 
      this.remainder = buf.slice(2 + lengthLength + this.length)
    }

    if (this.type === 'sequence' || this.type === 'set') {
      for (let x = this.value, y = null; 
        x.length;
        y = new Anode(this, x), this.children.push(y), x = y.remainder);
    } 
  }

  visit (f) {
    f(this)
    this.children.forEach(c => c.visit(acc, f))
  } 
}

