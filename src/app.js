const express = require('express')
const logger = require('morgan')
const bodyParser = require('body-parser')
const AppService = require('./services')
const resMiddware = require('./middleware/res')

const app = express()
const appService = new AppService()

if (process.env.DEBUG) global.useDebug = true

app.set('json spaces', 0)
app.use(logger('dev', { skip: (req, res) => res.nolog === true || app.nolog === true }))
// install body parser
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))
app.use(resMiddware)
app.get('/', (req, res) => res.status(200).send('#hello world'))
app.use('/upgrade', require('./routes/upgrade')(appService))
app.post('/bind', (req, res, next) => {
  if (!req.body.encrypted) return res.status(400).end()
  appService.boundDevice(req.body.encrypted, (err, data) => {
    if (err) return res.status(400).json(err)
    res.success(data)
  })
})

app.get('/info', (req, res, next) => res.success(appService.view()))
app.use('/winasd', require('./routes/winasd')(appService))

// 404 handler
app.use((req, res, next) => next(Object.assign(new Error('404 Not Found'), { status: 404 })))

// 500 handler
app.use((err, req, res, next) => {
  if (err) {
    if (req.log || process.env.LOGE) {
      console.log(':: ', err)
    }
  }

  // TODO check nodejs doc for more error properties such as syscall.
  res.status(err.status || 500).json({
    code: err.code,
    xcode: err.xcode,
    message: err.message,
    result: err.result,
    index: err.index,
    reason: err.reason,
    where: err.where
  })
})

app.listen(3001, err => {
  if (err) return console.log('winasd listen error: ', err.message)
  console.log('winasd started on port 3001')
})