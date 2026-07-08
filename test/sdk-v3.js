const S3Commands = require('@aws-sdk/client-s3')
const { S3Client } = S3Commands
const { getSignedUrl: presignUrl } = require('@aws-sdk/s3-request-presigner')
const aws4 = require('aws4')

const commandByMethod = Object.fromEntries(
  Object.entries(S3Commands)
    .filter(([name]) => name.endsWith('Command'))
    .map(([name, Command]) => [
      `${name[0].toLowerCase()}${name.slice(1, -'Command'.length)}`,
      Command,
    ])
)

const normalizeError = (err) => {
  err.code ||= err.name
  err.statusCode ||= err.$metadata?.httpStatusCode
  throw err
}

class S3 {
  constructor(options = {}) {
    this.config = {
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
      signatureVersion: options.signatureVersion,
      s3ForcePathStyle: options.s3ForcePathStyle,
      s3BucketEndpoint: options.s3BucketEndpoint,
      set: (key, value) => {
        this.config[key] = value
      },
    }

    this.setEndpoint(options.endpoint)
    this.updateClient(options)

    for (const [method, Command] of Object.entries(commandByMethod)) {
      this[method] = (params = {}) => ({
        promise: () =>
          this.sendCommand(method, Command, params)
            .then((res) => this.normalizeResponse(method, res))
            .catch(normalizeError),
      })
    }
  }

  updateClient(options = {}) {
    this.options = {
      ...this.options,
      ...options,
    }

    this.client = new S3Client({
      credentials: this.config.credentials,
      endpoint: this.endpoint.href,
      forcePathStyle: this.config.s3ForcePathStyle ?? this.options.s3ForcePathStyle ?? true,
      region: this.options.region ?? 'us-east-1',
    })

    const endpointPath = this.endpoint.pathname.replace(/\/$/, '')
    this.client.middlewareStack.add(
      (next) => async (args) => {
        if (endpointPath && args.request.path === endpointPath) {
          args.request.path = `${args.request.path}/`
        } else if (/^\/[^/]+\/$/.test(args.request.path)) {
          args.request.path = args.request.path.slice(0, -1)
        }

        return next(args)
      },
      { step: 'build', name: 'v2EmptySubresources', priority: 'low' }
    )

    this.client.middlewareStack.addRelativeTo(
      (next) => async (args) => {
        if (endpointPath && args.request.path === endpointPath) {
          args.request.path = `${args.request.path}/`
        } else if (/^\/[^/]+\/$/.test(args.request.path)) {
          args.request.path = args.request.path.slice(0, -1)
        }

        for (const header of [
          'amz-sdk-invocation-id',
          'amz-sdk-request',
          'x-amz-checksum-crc32',
          'x-amz-sdk-checksum-algorithm',
          'x-amz-user-agent',
        ]) {
          delete args.request.headers[header]
        }

        return next(args)
      },
      {
        name: 'v2SignedHeaders',
        relation: 'before',
        toMiddleware: 'awsAuthMiddleware',
      }
    )
  }

  setEndpoint(endpoint) {
    const href = endpoint ?? 'http://localhost'
    const url = new URL(/^https?:\/\//.test(href) ? href : `http://${href}`)

    this.endpoint = url
    this.endpoint.path = this.endpoint.pathname

    if (this.options) {
      this.updateClient()
    }
  }

  async getSignedUrl(method, params = {}) {
    const Command = commandByMethod[method]
    const expiresIn = params.Expires ?? 900
    const { Expires: _expires, ...commandParams } = params

    if (this.config.s3BucketEndpoint) {
      return this.getBucketEndpointSignedUrl(method, commandParams, expiresIn)
    }

    try {
      this.updateClient()
      return await presignUrl(this.client, new Command(commandParams), { expiresIn })
    } catch (err) {
      normalizeError(err)
    }
  }

  getBucketEndpointSignedUrl(method, params, expiresIn) {
    const url = new URL(this.endpoint.href)
    const pathPrefix = url.pathname.replace(/\/$/, '')
    url.pathname = `${pathPrefix}/${params.Key.split('/').map(encodeURIComponent).join('/')}`
    url.searchParams.set('X-Amz-Expires', expiresIn)

    const request = {
      host: url.host,
      method: method === 'putObject' ? 'PUT' : 'GET',
      path: `${url.pathname}${url.search}`,
      region: this.options.region ?? 'us-east-1',
      service: 's3',
      signQuery: true,
      headers: {
        host: url.host,
      },
    }

    aws4.sign(request, {
      accessKeyId: this.config.credentials.accessKeyId,
      secretAccessKey: this.config.credentials.secretAccessKey,
    })

    return `${url.protocol}//${url.host}${request.path}`
  }

  upload(params) {
    return this.putObject(params)
  }

  sendCommand(method, Command, params) {
    if (
      method === 'copyObject' &&
      params.MetadataDirective === 'REPLACE' &&
      params.ContentType === undefined
    ) {
      params = { ...params, ContentType: 'application/octet-stream' }
    }

    return this.client.send(new Command(params))
  }

  async normalizeResponse(method, res) {
    if (res.Body?.transformToByteArray) {
      res.Body = Buffer.from(await res.Body.transformToByteArray())
    }

    if (res.CopyObjectResult) {
      Object.assign(res, res.CopyObjectResult)
      delete res.CopyObjectResult
    }

    if (method === 'listObjects' || method === 'listObjectsV2') {
      res.Contents ||= []
      res.CommonPrefixes ||= []
    }
    if (method === 'getBucketLocation') {
      res.LocationConstraint ||= ''
    }

    delete res.$metadata

    return res
  }
}

module.exports = { S3 }
