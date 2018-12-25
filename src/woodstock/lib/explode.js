// slice the first single complete type out of given signature
const slice = (sig, start, end) => {
  switch (sig[start]) {
    case 'y': // 
    case 'b':
    case 'n':
    case 'q':
    case 'i':
    case 'u':
    case 'x':
    case 't':
    case 'd':
    case 'h':
    case 's':
    case 'o':
    case 'g':
    case 'v':
      return sig.slice(start, start + 1)
    case 'a':
      return 'a' + slice(sig, start + 1, end)
    case '(': {
      let count = 1
      for (let i = start + 1; i < end; i++) {
        if (sig[i] === '(') {
          count++
        } else if (sig[i] === ')') {
          if (!--count) {
            explode(sig, start + 1, i)
            return sig.slice(start, i + 1) 
          }
        }
      }  
      throw new Error(`unmatched ( at position ${start}`)
    }
    case '{': {
      if (start === 0 || sig[start - 1] !== 'a') {
        throw new Error(`not an array element type at position ${start}`)
      }

      for (let i = start + 1; i < end; i++) {
        if (sig[i] === '}') {

          let list = explode(sig, start + 1, i) 
          if (list.length !== 2) {
            throw new Error(`not two single complete types at position ${start}`)
          }

          if (!'ybnqiuxtdhsog'.includes(list[0])) {
            throw new Error(`not a basic type at position ${start}`)
          }

          return sig.slice(start, i + 1)
        }
      }

      throw new Error(`unmatched { at position ${start}`) 
    }
    default: 
      throw new Error(`invalid character ${sig[start]} at position ${start}`)
  }
}

// the content of a struct
// start, inclusive
// end, exclusive
const explode = (sig, start, end) => {
  if (sig.length === 0) return []

  start = start || 0
  end = end || sig.length

  let list = [] 
  while (start < end) {
    let single = slice(sig, start, end)
    list.push(single)
    start += single.length
  }
  return list
}

module.exports = explode
