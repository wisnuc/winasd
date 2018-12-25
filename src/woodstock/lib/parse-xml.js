const xml2js = require('xml2js')

const parseXml = xml => {
  let r
  xml2js.parseString(xml, (err, _r) => {
    if (err) throw err
    r = _r
  })
  return r
}

module.exports = parseXml
