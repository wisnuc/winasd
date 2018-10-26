const Router = require('express').Router

module.exports = (service) =>{
  const router = new Router()
  router.get('/', (req, res, next) => {
    service.getUpgradeList((err, data) => {
      err ? res.error(err) : res.success(data)
    })
  })
  return router
}