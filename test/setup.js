const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')

const S3rver = require('..')

const { resetTmpDir, setTmpDir, instances } = require('./helpers')

// Change the default options to be more test-friendly
S3rver.defaultOptions.port = 0
S3rver.defaultOptions.silent = true

beforeEach(() => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 's3rver_test-'))
  setTmpDir(tmpDir)
  S3rver.defaultOptions.directory = tmpDir
  resetTmpDir()
})

afterEach(async () => {
  await Promise.all(
    [...instances].map(async (instance) => {
      try {
        await instance.close()
      } catch (err) {
        console.warn(err)
      }
    })
  )
  instances.clear()
})
