const path = require('path')

module.exports =(req, res, next) => {

  let clean = () => {
    // if (req.connection) req.connection.release()
  }

  res.success = (data) => {
    clean()
    if (typeof data === 'string' && path.isAbsolute(data)) {
      return res.status(200).sendFile(data)
    }
    res.status(200).json(data)
  }

  res.error = (error) => {
    clean()
    if (error.status) {
      return res.status(error.status).json(error)
    }
    res.status(500).json(error)
  }
  next()
}