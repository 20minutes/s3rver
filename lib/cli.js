const fs = require('node:fs')
const { cli } = require('cleye')
const pkg = require('../package.json')
const S3rver = require('./s3rver')

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true })
  return directory
}

function parseConfigureBuckets(args) {
  const configureBuckets = []
  const filteredArgs = []
  let idx = 0

  while (idx < args.length) {
    const arg = args[idx]

    if (arg !== '--configure-bucket') {
      filteredArgs.push(arg)
      idx++
      continue
    }

    const name = args[idx + 1]
    if (!name || name.startsWith('-')) {
      throw new Error('missing required value for --configure-bucket <name>')
    }

    idx += 2
    const configs = []
    while (idx < args.length && !args[idx].startsWith('-')) {
      configs.push(fs.readFileSync(args[idx++]))
    }

    configureBuckets.push({ name, configs })
  }

  return { configureBuckets, filteredArgs }
}

async function parseAsync(argv = process.argv) {
  const { configureBuckets, filteredArgs } = parseConfigureBuckets(argv.slice(2))
  if (filteredArgs.includes('-v')) {
    console.info(pkg.version)
    return
  }

  const parsed = cli(
    {
      name: 's3rver',
      version: pkg.version,
      flags: {
        directory: {
          type: String,
          alias: 'd',
          description: 'Data directory',
          placeholder: '<path>',
        },
        address: {
          type: String,
          alias: 'a',
          description: 'Hostname or IP to bind to',
          placeholder: '<value>',
          default: S3rver.defaultOptions.address,
        },
        port: {
          type: String,
          alias: 'p',
          description: 'Port of the http server',
          placeholder: '<n>',
          default: S3rver.defaultOptions.port,
        },
        silent: {
          type: Boolean,
          alias: 's',
          description: 'Suppress log messages',
          default: S3rver.defaultOptions.silent,
        },
        key: {
          type: String,
          description: 'Path to private key file for running with TLS',
          placeholder: '<path>',
        },
        cert: {
          type: String,
          description: 'Path to certificate file for running with TLS',
          placeholder: '<path>',
        },
        serviceEndpoint: {
          type: String,
          description: 'Overrides the AWS service root for subdomain-style access',
          placeholder: '<address>',
          default: S3rver.defaultOptions.serviceEndpoint,
        },
        allowMismatchedSignatures: {
          type: Boolean,
          description: 'Prevent SignatureDoesNotMatch errors for all well-formed signatures',
        },
        vhostBuckets: {
          type: Boolean,
          description: 'Enables vhost-style access for all buckets',
          default: S3rver.defaultOptions.vhostBuckets,
        },
        configureBucket: {
          type: String,
          description:
            'Bucket name and configuration files for creating and configuring a bucket at startup',
          placeholder: '<name> [configs...]',
        },
      },
      booleanFlagNegation: true,
      strictFlags: true,
      help: {
        usage: 's3rver -d <path> [options]',
        examples: [
          '$ s3rver -d /tmp/s3rver -a 0.0.0.0 -p 0',
          '$ s3rver -d /tmp/s3rver --configure-bucket test-bucket ./cors.xml ./website.xml',
        ],
      },
    },
    undefined,
    filteredArgs
  )

  const opts = parsed.flags
  if (!opts.directory) {
    throw new Error('missing required option: -d, --directory <path>')
  }

  opts.directory = ensureDirectory(opts.directory)
  if (opts.key) {
    opts.key = fs.readFileSync(opts.key)
  }
  if (opts.cert) {
    opts.cert = fs.readFileSync(opts.cert)
  }
  opts.configureBuckets = configureBuckets

  const { address, port } = await new S3rver(opts).run()
  console.info()
  console.info('S3rver listening on %s:%d', address, port)
}

module.exports = { parseAsync }
