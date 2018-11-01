const express = require('express')
const logger = require('morgan')
const bodyParser = require('body-parser')
const AppService = require('./services')
const app = express()
const appService = new AppService()

if (process.env.DEBUG) global.useDebug = true

app.set('json spaces', 0)
app.use(logger('dev', { skip: (req, res) => res.nolog === true || app.nolog === true }))
app.get('/', (req, res) => res.status(200).send('#hello world'))
app.get('/upgrade', require('./routes/upgrade')(appService))

app.listen(3001, err => {
  if (err) return console.log('winasd listen error: ', err.message)
  console.log('winasd started on port 3001')
})