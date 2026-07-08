const { expect } = require('chai')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const pkg = require('../package.json')

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['bin/s3rver.js', ...args], {
      cwd: path.resolve(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('close', (code) => {
      resolve({ code, stdout, stderr })
    })
  })
}

function startCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['bin/s3rver.js', ...args], {
      cwd: path.resolve(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
      if (stdout.includes('S3rver listening on')) {
        child.kill()
      }
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('close', (code, signal) => {
      resolve({ code, signal, stdout, stderr })
    })
  })
}

describe('cli', () => {
  it('prints the package version', async () => {
    const result = await runCli(['--version'])

    expect(result.code).to.equal(0)
    expect(result.stdout.trim()).to.equal(pkg.version)
  })

  it('prints the package version with the short flag', async () => {
    const result = await runCli(['-v'])

    expect(result.code).to.equal(0)
    expect(result.stdout.trim()).to.equal(pkg.version)
  })

  it('requires a directory', async () => {
    const result = await runCli(['--silent', '--port', '0'])

    expect(result.code).to.equal(1)
    expect(result.stderr).to.include('missing required option: -d, --directory <path>')
  })

  it('starts with repeated preconfigured buckets', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 's3rver_cli_test-'))
    const result = await startCli([
      '--silent',
      '--directory',
      directory,
      '--port',
      '0',
      '--configure-bucket',
      'bucket-a',
      './example/cors.xml',
      './example/website.xml',
      '--configure-bucket',
      'bucket-b',
    ])

    expect(result.signal).to.equal('SIGTERM')
    expect(result.stdout).to.match(/S3rver listening on .+:\d+/)
    expect(fs.existsSync(path.join(directory, 'bucket-a'))).to.equal(true)
    expect(fs.existsSync(path.join(directory, 'bucket-b'))).to.equal(true)
  })
})
