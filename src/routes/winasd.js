const Router = require('express').Router

module.exports = (service) =>{
  const router = new Router()
  router.get('/info', (req, res, next) => {
    res.success(appService.view())
  })
  router.use('/upgrade', require('./upgrade')(appService))
  
  router.post('/device', (req, res, next) => {
    let { name } = req.body
    service.updateDeviceName(req.user, name, err => 
      err ? res.error(err) : res.success())
  })

  router.post('/bind', (req, res, next) => {
    if (!req.body.encrypted) return res.status(400).end()
    appService.boundDevice(req.body.encrypted, (err, data) => {
      if (err) return res.status(400).json(err)
      res.success(data)
    })
  })
  
  return router
}