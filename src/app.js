const express = require('express')

const app = express()

app.listen(3001, err => {
  if (err) return console.log('winas daemon listen error: ', err.message)
  console.log('winas started on port 3001')
})