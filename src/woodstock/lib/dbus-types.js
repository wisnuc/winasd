const debug = require('debug')
const explode = require('./explode')

const log = debug('dbus:types')
const logm = debug('marshal')
const logu = debug('unmarshal')

let $width = 3
let $ = ''
let $more = () => $ = $ + ' '.repeat($width)
let $less = () => $ = $.slice($width)

const LITTLE = Buffer.from('l')[0]
const BIG = Buffer.from('B')[0]

/**
A TYPE object may or may not have a value.

There are basic type and containr type. The basic type has fixed type and string-like type as its sub-type.

All basic types can either be constructed by a

An object of basic type, or VARIANT type can be constructed with a value, or can be constructed with an empty object, which value is load by unmarshal method later.

An ARRAY, STRUCT, and DICT_ENTRY object can only be constructed as an empty object with signature. The elements can

  TYPE                        size    align   construct
    BASIC_TYPE
      FIXED_TYPE
y       BYTE (UINT8)          1       1       o: number
n       INT16                 2       2       o: number
q       UINT16                2       2       o: number
i       INT32                 4       4       o: number
u       UINT32                4       4       o: number
b       BOOLEAN (UINT32)      4       4       o: number
x       INT64                 8       8       o: bigint
t       UINT64                8       8       o: bigint
d       DOUBLE                8       8       o: number
h       UNIX_FD               4       4       o: number

      STRING_LIKE_TYPE
s       STRING                        4       o: string
o       OBJECT_PATH                   4       o: string
g       SIGNATURE                     1       o: string

    CONTAINER_TYPE
a       ARRAY                         4       m: string (sig) | TYPE[]
(       STRUCT                        8       m: string (sig) | TYPE[]
v       VARIANT                       1       m: string = 'v' | TYPE[] = [SIGNATURE, TYPE]
{       DICT_ENTRY                    8       m: string (sig) | TYPE[] = [BASIC_TYPE, TYPE]

All TYPE has:

All CONTAINER_TYPE has

*/

const basicTypeCodes = 'ybnqiuxtdsogh'.split('')

const round = (offset, modulo) => Math.ceil(offset / modulo) * modulo

class TYPE {
  constructor (...args) {
    // abstract factory
    // new TYPE(sig) -> construct an empty TYPE object
    // new TYPE(sig, val) -> construct and TYPE object from value
    if (this.constructor === TYPE) { // abstract factory
      let Type = this.type(args[0])
      if (!Type) {
        throw new Error(`bad sig, ${args[0]}`)
      }

      if (args[1] === undefined) {
        if (Type.prototype instanceof CONTAINER_TYPE) {
          return new Type(args[0])
        } else {
          return new Type()
        }
      } else {
        if (Type.prototype instanceof CONTAINER_TYPE) {
          return new Type(args[0], args[1])
        } else {
          return new Type(args[1])
        }
      }
    }
  }

  type (sig) {
    return this._map[sig[0]]
  }

  // all TYPE object has this method
  // CONTAINER_TYPE should override this method except for VARIANT
  signature () {
    return this._code
  }
}

// code, align and size decorator
// all types have code and alignment, only fixed types have size
// all integer based types have sign, either true or false,
// the upper bound and lower bound are calculated according to sign and bits
// if no sign, the bound check is skipped
const DEC = ({ code, align, size, sign, bits }) => type => {
  // map: code -> type
  TYPE.prototype._map = Object.assign({}, TYPE.prototype._map, { [code]: type })
  type.prototype._code = code
  type.prototype._align = align
  if (size) {
    type.prototype._size = size
    if (typeof sign === 'boolean') {
      type.prototype._sign = sign
      type.prototype._bits = bits
    }
  }
  return type
}

// ANY common attribute besides dict_entry key?
class BASIC_TYPE extends TYPE {
  eval () {
    return this.value
  }
}

class FIXED_TYPE extends BASIC_TYPE {
  constructor (value) {
    super()
    if (value === undefined) {
    } else if (Number.isInteger(value)) {
      if (typeof this._sign === 'boolean') {
        let lower, upper
        switch (this._bits) {
          case 1:
            lower = 0
            upper = 1
            break
          case 8:
            lower = this._sign ? -0x80 : 0
            upper = this._sign ? 0x7f : 0xff
            break
          case 16:
            lower = this._sign ? -0x8000 : 0
            upper = this._sign ? 0x7fff : 0xffff
            break
          case 32:
            lower = this._sign ? -0x80000000 : 0
            upper = this._sign ? 0x7fffffff : 0xffffffff
            break
          default:
            throw new Error('invalid bits')
        }
        if (value < lower || value > upper) throw new Error('out of range')
      }
      this.value = value
    } else if (typeof value === 'bigint') {
      if (typeof this._sign !== 'boolean') throw new Error('no sign for bigint')
      let lower = this._sign ? -0x8000000000000000n : 0n
      let upper = this._sign ? 0x7fffffffffffffffn : 0xffffffffffffffffn
      if (value < lower || value > upper) throw new Error('out of range')
      this.value = value
    } else {
      throw new Error('invalid value type')
    }
  }

  marshal (buf, offset, le) {
    offset = round(offset, this._align)
    this._write(buf, offset, le)
    return offset + this._size
  }

  unmarshal (buf, offset, le) {
    let $0 = offset
    offset = round(offset, this._align)
    let $1 = offset
    this.value = this._read(buf, offset, le)
    offset += this._size

    logu($, this.constructor.name, `${$0}/${$1} to ${offset}, ${this.value}`)

    return offset
  }
}

const BYTE = DEC({ code: 'y', align: 1, size: 1, sign: false, bits: 8 })(
  class BYTE extends FIXED_TYPE {
    constructor (value) {
      if (typeof value === 'string' && value.length === 1) {
        value = Buffer.from(value)[0]
      }
      super(value)
    }

    _write (buf, offset, le) {
      buf.writeUInt8(this.value, offset)
    }

    _read (buf, offset, le) {
      return buf.readUInt8(offset)
    }
  })

const INT16 = DEC({ code: 'n', align: 2, size: 2, sign: true, bits: 16 })(
  class INT16 extends FIXED_TYPE {
    _write (buf, offset, le) {
      le ? buf.writeInt16LE(this.value, offset) : buf.writeInt16BE(this.value, offset)
    }

    _read (buf, offset, le) {
      return le ? buf.readInt16LE(offset) : buf.readInt16BE(offset)
    }
  })

const UINT16 = DEC({ code: 'q', align: 2, size: 2, sign: false, bits: 16 })(
  class UINT16 extends FIXED_TYPE {
    _write (buf, offset, le) {
      le ? buf.writeUInt16LE(this.value, offset) : buf.writeUInt16BE(this.value, offset)
    }

    _read (buf, offset, le) {
      return le ? buf.readUInt16LE(offset) : buf.readUInt16BE(offset)
    }
  })

const INT32 = DEC({ code: 'i', align: 4, size: 4, sign: true, bits: 32 })(
  class INT32 extends FIXED_TYPE {
    _write (buf, offset, le) {
      le ? buf.writeUInt16LE(this.value, offset) : buf.writeUInt16BE(this.value, offset)
    }

    _read (buf, offset, le) {
      return le ? buf.readUInt16LE(offset) : buf.readUInt16BE(offset)
    }
  })

const UINT32 = DEC({ code: 'u', align: 4, size: 4, sign: false, bits: 32 })(
  class UINT32 extends FIXED_TYPE {
    _write (buf, offset, le) {
      if (le) {
        buf.writeUInt32LE(this.value, offset)
      } else {
        buf.writeUInt32BE(this.value, offset)
      }
    }

    _read (buf, offset, le) {
      return le ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset)
    }
  })

const BOOLEAN = DEC({ code: 'b', align: 4, size: 4, sign: false, bits: 1 })(
  class BOOLEAN extends UINT32 {
    constructor (value) {
      if (typeof value === 'boolean') {
        value = value ? 1 : 0
      }
      super(value)
    }

    eval () {
      return !!this.value
    }
  })

const UNIX_FD = DEC({ code: 'h', align: 4, size: 4, sign: false, bits: 32 })(
  class UNIX_FD extends UINT32 {})

const INT64 = DEC({ code: 'x', align: 8, size: 8, sign: true, bits: 64 })(
  class INT64 extends FIXED_TYPE {
    _write (buf, offset, le) {
      // TODO
    }

    _read (buf, offset, le) {
      // TODO
    }
  })

const UINT64 = DEC({ code: 't', align: 8, size: 8, sign: false, bits: 64 })(
  class UINT64 extends FIXED_TYPE {
    _write (buf, offset, le) {
      // TODO
    }

    _read (buf, offset, le) {
      // TODO
    }
  })

const DOUBLE = DEC({ code: 'd', align: 8, size: 8 })(
  class DOUBLE extends FIXED_TYPE {
    _write (buf, offset, le) {
      le ? buf.writeDoubleLE(this.value, offset) : buf.writeDoubleBE(this.value, offset)
    }

    _read (buf, offset, le) {
      return le ? buf.readDoubleLE(offset) : buf.readDoubleBE(offset)
    }
  })

class STRING_LIKE_TYPE extends BASIC_TYPE {
  constructor (value) {
    super()
    if (typeof value === 'string') {
      this.value = value
    } else if (value === undefined) {
      // empty
    } else {
      throw new Error('value not a string')
    }
  }

  marshal (buf, offset, le) {
    let $0 = offset
    offset = round(offset, this._align)
    let $1 = offset

    this._write(buf, offset, le)
    offset += this._align // happens to be the same value
    buf.write(this.value, offset)
    offset += this.value.length
    buf.write('\0', offset)
    offset += 1

    logm($, this.constructor.name, `${$0}/${$1} to ${offset}, "${this.value}"`)

    return offset
  }

  unmarshal (buf, offset, le) {
    let d0 = offset
    offset = round(offset, this._align)
    let d1 = offset

    let strlen
    if (this._align === 1) {
      strlen = buf.readUInt8(offset)
    } else if (this._align === 4) {
      strlen = le ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset)
    } else {
      throw new Error('invalid align for string')
    }
    offset += this._align
    this.value = buf.slice(offset, offset + strlen).toString()
    // skip null termination
    offset += strlen + 1

    logu($, this.constructor.name, `${d0}/${d1} to ${offset}, "${this.value}"`)

    return offset
  }
}

const STRING = DEC({ code: 's', align: 4 })(
  class STRING extends STRING_LIKE_TYPE {
    constructor (value) {
      super(value)
      if (value) this.value = value
    }

    _write (buf, offset, le) {
      if (le) {
        buf.writeUInt32LE(this.value.length, offset)
      } else {
        buf.writeUInt32BE(this.value.length, offset)
      }
    }
  })

const OBJECT_PATH = DEC({ code: 'o', align: 4 })(
  class OBJECT_PATH extends STRING {
    constructor (value) {
      super(value)
    // TODO validate
    }
  })

const SIGNATURE = DEC({ code: 'g', align: 1 })(
  class SIGNATURE extends STRING_LIKE_TYPE {
    constructor (value) {
      super(value)
    // TODO validate
    }

    _write (buf, offset, le) {
      buf.writeUInt8(this.value.length, offset)
    }

    unmarshal (buf, offset, le) {
      offset = super.unmarshal(buf, offset, le)
      explode(this.value)
      return offset
    }
  })

// signature is a string, value is an array of TYPE object
// if signature is omitted, signature is generated automatically
// if value is omitted
class CONTAINER_TYPE extends TYPE {
  // new CONTAINER(signature) constructs an empty object, intended for unmarshalling.
  // new CONTAINER(elems, signature) constructs an object loaded with elements, signature is optional, if provided, the constructor will check if they are match.
  // new CONTAINER(signature, vals) constructs an object loaded with elements converted from vals, signature is mandatory.
  // VARIANT is forbidden in construction by value.
  //

  // elems must be an array of TYPE objects, if signature is not provided, the array
  // must not be empty
  // signature must be non-empty string
  constructor (...args) {
    super()
    if (args.length === 1) {
      if (typeof args[0] === 'string') {
        this.constructBySignature(args[0])
        return
      } else if (Array.isArray(args[0])) {
        if (!args[0].every(e => e instanceof TYPE)) {
          throw new Error('elems contains non-TYPE object')
        }
        this.constructByElements(args[0])
        return
      }
    } else if (args.length === 2) {
      if (Array.isArray(args[0]) && typeof args[1] === 'string') {
        if (!args[0].every(e => e instanceof TYPE)) {
          console.log(args[0])
          throw new Error('elems contains non-TYPE object')
        }
        this.constructByElements(args[0], args[1])
        return
      } else if (typeof args[0] === 'string' && Array.isArray(args[1])) {
        if (!args[1].every(e => !(e instanceof TYPE))) {
          throw new Error('elems contains TYPE object')
        }
        
        log('constructByValues', this.constructor.name, args[0], args[1])

        this.constructByValues(args[0], args[1])
        return
      }
    }
    throw new Error('bad arg number')
  }

  // intended for unmarshalling
  constructBySignature (sig) {
    throw new Error('virtual method')
  }

  // sig is optional
  constructByElements (elems, sig) {
    throw new Error('virtual method')
  }

  // sig is mandatory
  constructByValues (vals, sig) {
    throw new Error('virtual method')
  }

  signature () {
    return this.sig
  }

  eval () {
    return this.elems.map(elem => elem.eval())
  }

  marshal (buf, offset, le) {
    let $0 = offset
    offset = round(offset, this._align)
    let $1 = offset

    logm($, this.constructor.name, `${$0}/${$1}, {`)
    $more()

    offset = this.elems.reduce((offset, el) => {
      return el.marshal(buf, offset, le)
    }, round(offset, this._align))

    $less()
    logm($, '}', `@${offset}, ${this.elems.length} element(s)`)

    return offset
  }
}

const ARRAY = DEC({ code: 'a', align: 4 })(
  class ARRAY extends CONTAINER_TYPE {
    constructBySignature (sig) {
      if (sig[0] !== 'a') {
        throw new Error('not an ARRAY signature')
      }
      this.sig = sig
      this.esig = this.sig.slice(1)
      this.elems = []
    }

    constructByElements (elems, sig) {
      if (elems.length === 0) {
        return this.constructBySignature(sig)
      } else {
        let esig = elems[0].signature()
        if (!elems.every(e => e.signature() === esig)) {
          throw new Error('ARRAY elements must have the same signature')
        } else if (esig !== sig.slice(1)) {
          throw new Error('ARRAY elements do not match given signature')
        }
        this.elems = elems
        this.esig = esig
        this.sig = 'a' + esig
      }
    }

    constructByValues (sig, vals) {
      this.sig = sig
      this.esig = sig.slice(1)
      this.elems = vals.map(v => new TYPE(this.esig, v))
    }

    eval () {
      return this.elems.map(elem => elem.eval())
    }

    // return offset TODO elem align refactor
    marshal (buf, offset, le) {
      let $0 = offset
      offset = round(offset, 4)
      let $1 = offset

      let numOffset = offset
      offset += this._align
      offset = round(offset, this.type(this.esig).prototype._align)
      let elemOffset = offset

      logm($, this.constructor.name,
        `${$0}/${$1}, num @ ${numOffset}, element[0] @ ${elemOffset} {`)
      $more()

      offset = this.elems.reduce((offset, elem) =>
        elem.marshal(buf, offset, le), elemOffset)

      let num = offset - elemOffset
      if (le) {
        buf.writeUInt32LE(num, numOffset)
      } else {
        buf.writeUInt32BE(num, numOffset)
      }

      $less()
      logm($, '}', `@${offset}, num: ${num}, ${this.elems.length} element(s)`)
      return offset
    }

    unmarshal (buf, offset, le) {
      let d0 = offset
      offset = round(offset, this._align)
      let d1 = offset

      let num = le ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset)
      offset += 4
      offset = round(offset, this.type(this.esig).prototype._align)
      let elemStart = offset

      logu($, this.constructor.name, `${d0}/${d1}, n: ${num}, es: ${offset} {`)
      $more()

      while (offset < elemStart + num) {
        let elem = new TYPE(this.esig)
        offset = elem.unmarshal(buf, offset, le)
        this.elems.push(elem)
      }

      $less()
      logu($, '}', `@ ${offset}, ${this.elems.length} element(s)`)

      return elemStart + num
    }

    push (elem) {
      if (elem.signature() !== this.esig) throw new Error('signature mismatch')
      this.elems.push(elem)
      return this
    }
  })

// no container header, accept list of single complete types
const STRUCT = DEC({ code: '(', align: 8 })(
  class STRUCT extends CONTAINER_TYPE {
    constructBySignature (sig) {
      if (!/^\(.+\)$/.test(sig)) throw new Error('invalid STRUCT signature')
      this.esigs = explode(sig.slice(1, sig.length - 1))
      this.sig = sig
      this.elems = []
    }

    constructByElements (elems, sig) {
      if (sig) {
        this.constructBySignature(sig)
        elems.forEach(e => this.push(e))
      } else {
        this.elems = elems
        this.esigs = this.elems.map(e => e.signature)
        this.sig = '(' + this.esigs.join('') + ')'
      }
    }

    constructByValues (sig, values) {
      throw new Error('not implemented, yet')
    }

    eval () {
      return this.elems.map(elem => elem.eval())
    }

    unmarshal (buf, offset, le) {
      let d0 = offset
      offset = round(offset, this._align)
      let d1 = offset

      logu($, this.constructor.name, `${d0}/${d1} {`)
      $more()

      this.elems = []
      this.esigs.forEach(sig => {
        let elem = new TYPE(sig)
        offset = elem.unmarshal(buf, offset, le)
        this.elems.push(elem)
      })

      $less()
      logu($, '}', `@ ${offset}, ${this.elems.length} elements`)

      return offset
    }

    push (elem) {
      if (this.elems.length >= this.esigs.length) throw new Error('elems full')
      if (elem.signature() !== this.esigs[this.elems.length]) {
        throw new Error('signature mismatch')
      }
      this.elems.push(elem)
      return this
    }
  })

const DICT_ENTRY = DEC({ code: '{', align: 8 })(
  class DICT_ENTRY extends STRUCT {
    constructBySignature (sig) {
      if (!/^\{.+\}$/.test(sig)) throw new Error('invalid DICT_ENTRY signature')
      let esigs = explode(sig.slice(1, sig.length - 1))
      if (esigs.length !== 2) {
        throw new Error('dict entry requires exactly two elements as key value')
      } else if (!basicTypeCodes.includes(esigs[0])) {
        throw new Error('dict entry key must be of a basic type')
      }
      this.esigs = esigs
      this.sig = sig
      this.elems = []
    }

    // partial construction allowed if sig provided
    constructByElements (elems, sig) {
      if (sig) {
        this.constructBySignature(sig)
        elems.forEach(e => this.push(e))
      } else {
        if (elems.length !== 2) {
          throw new Error('dict entry requires exactly two elements as key-value')
        } else if (!basicTypeCodes.includes(elems[0].signature())) {
          throw new Error('dict entry key must be of a basic type')
        }

        this.esigs = elems.map(e => e.signature())
        this.sig = '{' + this.esigs.join('') + '}'
        this.elems = elems
      }
    }

    constructByValues (sig, values) {
      if (!/^\{.+\}$/.test(sig)) {
        throw new Error('invalid DICT_ENTRY signature')
      } 

      this.sig = sig
      let esigs = explode(sig.slice(1, sig.length - 1)) 
      if (values.length !== 2 || esigs.length !== 2) {
        throw new Error('dict entry requires exactly two elements as key value') 
      }

      this.esigs = esigs
      this.elems = [
        new TYPE(esigs[0], values[0]), 
        new TYPE(esigs[1], values[1])
      ] 
    }
  })

const VARIANT = DEC({ code: 'v', align: 1 })(
  // VARIANT accept only elements arg
  class VARIANT extends CONTAINER_TYPE {
    // new VARIANT() -> construct by signature
    // new VARIANT(TYPE) -> construct by elements
    // new VARIANT(esig, non-TYPE) -> construct by value ???
    constructor (...args) {
      if (args.length === 0) {
        super('v')
      } else {
        if (args.length === 1) {
          if (args[0] === 'v') {
            super('v')
          } else {
            super([args[0]], 'v')
          }
        } else {
          super(...args)
        }
      }
    }

    // sig is always 'v'
    constructBySignature (sig) {
      this.sig = sig
      this.esigs = []
      this.elems = []
    }

    // ???
    constructByElements ([elem], sig) {
      this.elems = [new SIGNATURE(elem.signature()), elem]
      this.esigs = this.elems.map(elem => elem.signature())
      this.sig = sig
    }

    constructByValues (sig, vals) {
      if (sig !== 'v') {
        throw new Error('invalid signature')
      } else if (vals.length !== 2) {
        throw new Error('VARIANT reqruires exactly two values as signature and value')
      } 

      // TODO assert

      this.sig = 'v'
      this.elems = [new SIGNATURE(vals[0]), new TYPE(vals[0], vals[1])]
      this.esigs = this.elems.map(elem => elem.signature())
    }

    unmarshal (buf, offset, le) {
      let d0 = offset

      logu($, this.constructor.name, `${d0}/${d0} {`)
      $more()

      let e0 = new SIGNATURE()
      offset = e0.unmarshal(buf, offset, le)
      this.elems.push(e0)
      this.esig = e0.value

      let elem = new TYPE(this.esig)
      offset = elem.unmarshal(buf, offset, le)
      this.elems.push(elem)

      $less()
      logu($, '}', `@ ${offset}, ${this.elems.length} elements`)

      return offset
    }
  })

module.exports = {
  LITTLE,
  BIG,
  TYPE,
  BYTE,
  BOOLEAN,
  INT16,
  UINT16,
  INT32,
  UINT32,
  INT64,
  UINT64,
  DOUBLE,
  UNIX_FD,
  STRING,
  OBJECT_PATH,
  SIGNATURE,
  ARRAY,
  STRUCT,
  DICT_ENTRY,
  VARIANT
}
