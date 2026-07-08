const Router = require('@koa/router')
const { union } = require('lodash')

const bucketCtrl = require('./controllers/bucket')
const objectCtrl = require('./controllers/object')
const serviceCtrl = require('./controllers/service')
const authenticationMiddleware = require('./middleware/authentication')
const corsMiddleware = require('./middleware/cors')
const responseHeaderOverrideMiddleware = require('./middleware/response-header-override')
const websiteMiddleware = require('./middleware/website')
const S3Error = require('./models/error')

const router = new Router()
const bucketAndKeyPath = '/:bucket{/*key}'
const optionalBucketAndKeyPath = '/{:bucket{/*key}}'
const objectPath = '/:bucket/*key'

// NOTE: The below is only an approximation of S3's behavior
// For the most part, S3 will complain if you attempt a bucket method on an object, but
// it won't consisently reject actions on buckets that are supported by objects (and vice-versa).
const queryMethod = (methods) =>
  async function queryMethod(ctx, next) {
    const matchedMethods = methods.filter((method) => method in ctx.query)
    if (matchedMethods.length > 1) {
      throw new S3Error(
        'InvalidArgument',
        `Conflicting query string parameters: ${matchedMethods.join(', ')}`,
        {
          ArgumentName: 'ResourceType',
          ArgumentValue: matchedMethods[0],
        }
      )
    }
    if (matchedMethods.length === 1) {
      ctx.params.queryMethod = matchedMethods[0]
    }
    await next()
    if (ctx.state.methodIsNotAllowed) {
      throw new S3Error(
        'MethodNotAllowed',
        'The specified method is not allowed against this resource.',
        {
          Method: ctx.method.toUpperCase(),
          ResourceType: ctx.params.queryMethod.toUpperCase(),
        }
      )
    }
  }

router.all(bucketAndKeyPath, corsMiddleware())
router.use(bucketAndKeyPath, websiteMiddleware())
router.use(optionalBucketAndKeyPath, authenticationMiddleware())
router.use(bucketAndKeyPath, responseHeaderOverrideMiddleware())

router.get('/', serviceCtrl.getService)

router
  .use('/:bucket', queryMethod(bucketCtrl.METHODS))
  .delete('/:bucket', bucketCtrl.bucketExists, (ctx) => {
    switch (ctx.params.queryMethod) {
      case undefined:
        return bucketCtrl.deleteBucket(ctx)
      case 'cors':
        return bucketCtrl.deleteBucketCors(ctx)
      case 'website':
        return bucketCtrl.deleteBucketWebsite(ctx)
      case 'analysis':
      case 'encryption':
      case 'lifecycle':
      case 'publicAccessBlock':
      case 'metrics':
      case 'policy':
      case 'replication':
      case 'tagging':
        throw new S3Error(
          'NotImplemented',
          'A parameter you provided implies functionality that is not implemented'
        )
      default:
        ctx.state.methodIsNotAllowed = true
    }
  })
  .get('/:bucket', bucketCtrl.bucketExists, (ctx) => {
    switch (ctx.params.queryMethod) {
      case undefined:
        return bucketCtrl.getBucket(ctx)
      case 'cors':
        return bucketCtrl.getBucketCors(ctx)
      case 'location':
        return bucketCtrl.getBucketLocation(ctx)
      case 'website':
        return bucketCtrl.getBucketWebsite(ctx)
      case 'acl':
      case 'analytics':
      case 'encryption':
      case 'inventory':
      case 'lifecycle':
      case 'logging':
      case 'metrics':
      case 'notification':
      case 'object-lock':
      case 'policyStatus':
      case 'publicAccessBlock':
      case 'replication':
      case 'requestPayment':
      case 'tagging':
      case 'uploads':
      case 'versioning':
        throw new S3Error(
          'NotImplemented',
          'A parameter you provided implies functionality that is not implemented'
        )
      default:
        ctx.state.methodIsNotAllowed = true
    }
  })
  .post('/:bucket', bucketCtrl.bucketExists, (ctx) => {
    switch (ctx.params.queryMethod) {
      case undefined:
        return objectCtrl.postObject(ctx)
      case 'delete':
        return objectCtrl.deleteMultipleObjects(ctx)
      default:
        ctx.state.methodIsNotAllowed = true
    }
  })
  .put('/:bucket', async (ctx) => {
    if (ctx.params.queryMethod) {
      await bucketCtrl.bucketExists(ctx)
    }
    switch (ctx.params.queryMethod) {
      case undefined:
        return bucketCtrl.putBucket(ctx)
      case 'cors':
        return bucketCtrl.putBucketCors(ctx)
      case 'website':
        return bucketCtrl.putBucketWebsite(ctx)
      case 'accelerate':
      case 'acl':
      case 'analytics':
      case 'encryption':
      case 'inventory':
      case 'lifecycle':
      case 'logging':
      case 'metrics':
      case 'notification':
      case 'policy':
      case 'publicAccessBlock':
      case 'replication':
      case 'requestPayment':
      case 'tagging':
      case 'versioning':
        throw new S3Error(
          'NotImplemented',
          'A parameter you provided implies functionality that is not implemented'
        )
      default:
        ctx.state.methodIsNotAllowed = true
    }
  })

const objectMethods = union(bucketCtrl.METHODS, objectCtrl.METHODS).sort()
router
  .use(objectPath, bucketCtrl.bucketExists, queryMethod(objectMethods))
  .delete(objectPath, (ctx) => {
    switch (ctx.params.queryMethod) {
      case undefined:
        return objectCtrl.deleteObject(ctx)
      case 'tagging':
        throw new S3Error('NotImplemented')
      default:
        ctx.state.methodIsNotAllowed = true
    }
  })
  .get(objectPath, (ctx) => {
    switch (ctx.params.queryMethod) {
      case undefined:
        return objectCtrl.getObject(ctx)
      case 'acl':
        return objectCtrl.getObjectAcl(ctx)
      case 'tagging':
        return objectCtrl.getObjectTagging(ctx)
      case 'legal-hold':
      case 'retention':
      case 'torrent':
        throw new S3Error(
          'NotImplemented',
          'A parameter you provided implies functionality that is not implemented'
        )
      default:
        ctx.state.methodIsNotAllowed = true
    }
  })
  .post(objectPath, (ctx) => {
    switch (ctx.params.queryMethod) {
      case 'uploadId':
        return objectCtrl.completeMultipartUpload(ctx)
      case 'uploads':
        return objectCtrl.initiateMultipartUpload(ctx)
      case undefined:
      case 'select':
        throw new S3Error('NotImplemented')
      default:
        ctx.state.methodIsNotAllowed = true
    }
  })
  .put(objectPath, (ctx) => {
    switch (ctx.params.queryMethod) {
      case undefined:
        return 'x-amz-copy-source' in ctx.headers
          ? objectCtrl.putObjectCopy(ctx)
          : objectCtrl.putObject(ctx)
      case 'uploadId':
        return 'x-amz-copy-source' in ctx.headers
          ? objectCtrl.uploadPartCopy(ctx)
          : objectCtrl.uploadPart(ctx)
      case 'tagging':
        return objectCtrl.putObjectTagging(ctx)
      case 'acl':
        throw new S3Error(
          'NotImplemented',
          'A parameter you provided implies functionality that is not implemented'
        )
      default:
        ctx.state.methodIsNotAllowed = true
    }
  })

// append trailing slash to key when applicable
router.param('key', (key, ctx, next) => {
  if (Array.isArray(key)) {
    ctx.params.key = key.join('/')
  }
  if (ctx.params.key && ctx.path.endsWith('/') && !ctx.params.key.endsWith('/')) {
    ctx.params.key = `${ctx.params.key}/`
  }
  return next()
})

module.exports = router
