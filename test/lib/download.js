const Downloader = require('src/lib/download')

let bucketKey = 'beta/abel/abel-201810221354-0.0.2-ccccc.json'
let tmpDir = 'tmptest/tmp'
let dstDir = 'tmptest/iso'
describe('test downloader', () => {

  it('down success', function(done) {
    this.timeout(1000000)
    let downloader = new Downloader(bucketKey, tmpDir, dstDir)

    downloader.on('Finished', () => {
      console.log(downloader)
      done()
    })

    downloader.on('Failed', () => {
      downloader.destroy()
      done(downloader.state.error)
    })
  })

})