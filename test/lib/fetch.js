const Fetcher = require('src/lib/fetch')

describe('test downloader', () => {
  it('down success', function(done) {
    this.timeout(1000000)
    let fetcher = new Fetcher(true)

    fetcher.on('Pending', () => {
      console.log(fetcher)
      done(fetcher.last.error ? new Error(fetcher.last.error.message) : undefined)
    })
  })
})