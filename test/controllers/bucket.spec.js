const fs = require('node:fs')
const { find } = require('lodash')

const { createServerAndClient, generateTestObjects } = require('../helpers')

describe('Operations on Buckets', () => {
  let s3Client
  const buckets = [
    // plain, unconfigured bucket
    {
      name: 'bucket-a',
    },

    // AWS default CORS settings when enabling it in the UI
    {
      name: 'cors-test0',
      configs: [fs.readFileSync(require.resolve('../fixtures/cors-test0.xml'))],
    },

    // A standard static hosting configuration with no custom error page
    {
      name: 'website-test0',
      configs: [fs.readFileSync(require.resolve('../fixtures/website-test0.xml'))],
    },
  ]

  beforeEach(async () => {
    ;({ s3Client } = await createServerAndClient({
      configureBuckets: buckets,
    }))
  })

  describe('DELETE Bucket', () => {
    it('deletes a bucket', async () => {
      await s3Client.deleteBucket({ Bucket: 'bucket-a' }).promise()
    })

    it('deletes a bucket configured with CORS', async () => {
      await s3Client.deleteBucket({ Bucket: 'cors-test0' }).promise()
    })

    it('deletes an empty bucket after a key nested in a directory has been deleted', async () => {
      await s3Client
        .putObject({
          Bucket: 'bucket-a',
          Key: 'foo/bar/foo.txt',
          Body: 'Hello!',
        })
        .promise()
      await s3Client.deleteObject({ Bucket: 'bucket-a', Key: 'foo/bar/foo.txt' }).promise()
      await s3Client.deleteBucket({ Bucket: 'bucket-a' }).promise()
    })

    it('fails to delete a bucket because it is not empty', async () => {
      let error
      await generateTestObjects(s3Client, 'bucket-a', 20)
      try {
        await s3Client.deleteBucket({ Bucket: 'bucket-a' }).promise()
      } catch (err) {
        error = err
      }
      expect(error).to.exist
      expect(error.code).to.equal('BucketNotEmpty')
      expect(error.statusCode).to.equal(409)
    })

    it('fails to fetch a deleted bucket', async () => {
      let error
      await s3Client.deleteBucket({ Bucket: 'bucket-a' }).promise()
      try {
        await s3Client.listObjects({ Bucket: 'bucket-a' }).promise()
      } catch (err) {
        error = err
        expect(err.code).to.equal('NoSuchBucket')
        expect(err.statusCode).to.equal(404)
      }
      expect(error).to.exist
    })
  })

  describe('DELETE Bucket cors', () => {
    it('deletes a CORS configuration in a configured bucket', async () => {
      let error
      try {
        await s3Client.deleteBucketCors({ Bucket: 'cors-test0' }).promise()
        await s3Client.getBucketCors({ Bucket: 'cors-test0' }).promise()
      } catch (err) {
        error = err
      }
      expect(error).to.exist
      expect(error.code).to.equal('NoSuchCORSConfiguration')
    })
  })

  describe('DELETE Bucket website', () => {
    it('deletes a website configuration in a configured bucket', async () => {
      await s3Client.deleteBucketWebsite({ Bucket: 'website-test0' }).promise()
      let error
      try {
        await s3Client.getBucketWebsite({ Bucket: 'website-test0' }).promise()
      } catch (err) {
        error = err
      }
      expect(error).to.exist
      expect(error.code).to.equal('NoSuchWebsiteConfiguration')
    })
  })

  describe('GET Bucket (List Objects) Version 1', () => {
    const testObjects = ['akey1', 'akey2', 'akey3', 'key/key1', 'key1', 'key2', 'key3']

    const createTestObjects = () =>
      Promise.all(
        testObjects.map((key) =>
          s3Client
            .putObject({
              Bucket: 'bucket-a',
              Key: key,
              Body: 'Hello!',
            })
            .promise()
        )
      )

    it('lists objects in a bucket', async () => {
      await createTestObjects()
      const data = await s3Client.listObjects({ Bucket: 'bucket-a' }).promise()
      expect(data.Name).to.equal('bucket-a')
      expect(data.Contents).to.have.lengthOf(testObjects.length)
      expect(data.IsTruncated).to.be.false
      expect(data.MaxKeys).to.equal(1000)
    })

    it('lists objects in a bucket filtered by a prefix', async () => {
      await createTestObjects()
      const data = await s3Client.listObjects({ Bucket: 'bucket-a', Prefix: 'key' }).promise()
      expect(data.Contents).to.have.lengthOf(4)
      expect(find(data.Contents, { Key: 'akey1' })).to.not.exist
      expect(find(data.Contents, { Key: 'akey2' })).to.not.exist
      expect(find(data.Contents, { Key: 'akey3' })).to.not.exist
    })

    it('lists objects in a bucket starting after a marker', async () => {
      await createTestObjects()
      const data = await s3Client
        .listObjects({
          Bucket: 'bucket-a',
          Marker: 'akey3',
        })
        .promise()
      expect(data.Contents).to.have.lengthOf(4)
    })

    it('lists objects in a bucket filtered by a prefix starting after a marker', async () => {
      await createTestObjects()
      const data = await s3Client
        .listObjects({
          Bucket: 'bucket-a',
          Prefix: 'akey',
          Marker: 'akey2',
        })
        .promise()
      expect(data.Contents).to.have.lengthOf(1)
      expect(data.Contents[0]).to.have.property('Key', 'akey3')
    })

    it('lists 100 objects without returning the next marker', async () => {
      await generateTestObjects(s3Client, 'bucket-a', 200)
      const data = await s3Client.listObjects({ Bucket: 'bucket-a', MaxKeys: 100 }).promise()
      expect(data.IsTruncated).to.be.true
      expect(data.Contents).to.have.lengthOf(100)
      expect(data.NextMarker).to.not.exist
    }, 30000)

    it('lists 100 delimited objects and return the next marker', async () => {
      await generateTestObjects(s3Client, 'bucket-a', 200)
      const data = await s3Client
        .listObjects({
          Bucket: 'bucket-a',
          MaxKeys: 100,
          Delimiter: '/',
        })
        .promise()
      expect(data.IsTruncated).to.be.true
      expect(data.Contents).to.have.lengthOf(100)
      expect(data.NextMarker).to.equal('key099')
    }, 30000)

    it('lists no objects for a bucket', async () => {
      await s3Client.listObjects({ Bucket: 'bucket-a' }).promise()
      const objects = await s3Client.listObjects({ Bucket: 'bucket-a' }).promise()
      expect(objects.Contents).to.have.lengthOf(0)
    })
  })

  describe('GET Bucket (List Objects) Version 2', () => {
    it('lists objects in a bucket filtered by a prefix', async () => {
      const testObjects = ['akey1', 'akey2', 'akey3', 'key/key1', 'key1', 'key2', 'key3']
      await Promise.all(
        testObjects.map((key) =>
          s3Client.putObject({ Bucket: 'bucket-a', Key: key, Body: 'Hello!' }).promise()
        )
      )
      const data = await s3Client.listObjectsV2({ Bucket: 'bucket-a', Prefix: 'key' }).promise()
      expect(data.Contents).to.have.lengthOf(4)
      expect(find(data.Contents, { Key: 'akey1' })).to.not.exist
      expect(find(data.Contents, { Key: 'akey2' })).to.not.exist
      expect(find(data.Contents, { Key: 'akey3' })).to.not.exist
    })

    it('lists objects in a bucket starting after a key', async () => {
      const testObjects = ['akey1', 'akey2', 'akey3', 'key/key1', 'key1', 'key2', 'key3']
      await Promise.all(
        testObjects.map((key) =>
          s3Client.putObject({ Bucket: 'bucket-a', Key: key, Body: 'Hello!' }).promise()
        )
      )
      const data = await s3Client
        .listObjectsV2({
          Bucket: 'bucket-a',
          StartAfter: 'akey3',
        })
        .promise()
      expect(data.Contents).to.have.lengthOf(4)
    })

    it('lists objects in a bucket starting after a nonexistent key', async () => {
      const testObjects = ['akey1', 'akey2', 'akey3', 'key/key1', 'key1', 'key2', 'key3']
      await Promise.all(
        testObjects.map((key) =>
          s3Client.putObject({ Bucket: 'bucket-a', Key: key, Body: 'Hello!' }).promise()
        )
      )
      const data = await s3Client
        .listObjectsV2({
          Bucket: 'bucket-a',
          StartAfter: 'akey4',
        })
        .promise()
      expect(data.Contents).to.have.lengthOf(4)
    })

    it('lists prefix/foo after prefix.foo in a bucket', async () => {
      const testObjects = ['prefix.foo', 'prefix/foo']
      await Promise.all(
        testObjects.map((key) =>
          s3Client.putObject({ Bucket: 'bucket-a', Key: key, Body: 'Hello!' }).promise()
        )
      )
      const data = await s3Client
        .listObjectsV2({
          Bucket: 'bucket-a',
          Delimiter: '/',
          StartAfter: 'prefix.foo',
        })
        .promise()
      expect(data.Contents).to.have.lengthOf(0)
      expect(data.CommonPrefixes).to.have.lengthOf(1)
      expect(data.CommonPrefixes[0]).to.have.property('Prefix', 'prefix/')
    })

    it('lists objects in a bucket filtered prefix starting after a key', async () => {
      const testObjects = ['akey1', 'akey2', 'akey3', 'key/key1', 'key1', 'key2', 'key3']
      await Promise.all(
        testObjects.map((key) =>
          s3Client.putObject({ Bucket: 'bucket-a', Key: key, Body: 'Hello!' }).promise()
        )
      )
      const data = await s3Client
        .listObjectsV2({
          Bucket: 'bucket-a',
          Prefix: 'akey',
          StartAfter: 'akey2',
        })
        .promise()
      expect(data.Contents).to.have.lengthOf(1)
      expect(data.Contents[0]).to.have.property('Key', 'akey3')
    })

    it('lists objects in a bucket filtered by a delimiter', async () => {
      const testObjects = ['akey1', 'akey2', 'akey3', 'key/key1', 'key1', 'key2', 'key3']
      await Promise.all(
        testObjects.map((key) =>
          s3Client.putObject({ Bucket: 'bucket-a', Key: key, Body: 'Hello!' }).promise()
        )
      )
      const data = await s3Client.listObjectsV2({ Bucket: 'bucket-a', Delimiter: '/' }).promise()
      expect(data.Contents).to.have.lengthOf(6)
      expect(data.CommonPrefixes).to.have.lengthOf(1)
      expect(data.CommonPrefixes[0]).to.have.property('Prefix', 'key/')
    })

    it('lists folders in a bucket filtered by a prefix and a delimiter', async () => {
      const testObjects = [
        'folder1/file1.txt',
        'folder1/file2.txt',
        'folder1/folder2/file3.txt',
        'folder1/folder2/file4.txt',
        'folder1/folder2/file5.txt',
        'folder1/folder2/file6.txt',
        'folder1/folder4/file7.txt',
        'folder1/folder4/file8.txt',
        'folder1/folder4/folder5/file9.txt',
        'folder1/folder3/file10.txt',
      ]

      await Promise.all(
        testObjects.map((key) =>
          s3Client.putObject({ Bucket: 'bucket-a', Key: key, Body: 'Hello!' }).promise()
        )
      )

      const data = await s3Client
        .listObjectsV2({
          Bucket: 'bucket-a',
          Prefix: 'folder1/',
          Delimiter: '/',
        })
        .promise()
      expect(data.CommonPrefixes).to.have.lengthOf(3)
      expect(data.CommonPrefixes[0]).to.have.property('Prefix', 'folder1/folder2/')
      expect(data.CommonPrefixes[1]).to.have.property('Prefix', 'folder1/folder3/')
      expect(data.CommonPrefixes[2]).to.have.property('Prefix', 'folder1/folder4/')
    })

    it('truncates a listing to 500 objects', async (ctx) => {
      await generateTestObjects(s3Client, 'bucket-a', 1000)
      let data
      try {
        data = await s3Client.listObjectsV2({ Bucket: 'bucket-a', MaxKeys: 500 }).promise()
      } catch (e) {
        // mosty happen in node 18 with the error "EMFILE: too many open files"
        if (e.code === 'InternalError') {
          ctx.skip()
        }
      }
      expect(data.IsTruncated).to.be.true
      expect(data.KeyCount).to.equal(500)
      expect(data.Contents).to.have.lengthOf(500)
    }, 30000)

    it('reports no truncation when setting max keys to 0', async () => {
      await generateTestObjects(s3Client, 'bucket-a', 100)
      const data = await s3Client.listObjectsV2({ Bucket: 'bucket-a', MaxKeys: 0 }).promise()
      expect(data.IsTruncated).to.be.false
      expect(data.KeyCount).to.equal(0)
      expect(data.Contents).to.have.lengthOf(0)
    })

    it('lists at most 1000 objects', async (ctx) => {
      await generateTestObjects(s3Client, 'bucket-a', 1100)
      let data
      try {
        data = await s3Client.listObjectsV2({ Bucket: 'bucket-a', MaxKeys: 1100 }).promise()
      } catch (e) {
        // mosty happen in node 18 with the error "EMFILE: too many open files"
        if (e.code === 'InternalError') {
          ctx.skip()
        }
      }
      expect(data.IsTruncated).to.be.true
      expect(data.MaxKeys).to.equal(1100)
      expect(data.Contents).to.have.lengthOf(1000)
      expect(data.KeyCount).to.equal(1000)
    }, 30000)

    it('lists 100 objects and return a continuation token', async (ctx) => {
      await generateTestObjects(s3Client, 'bucket-a', 200)
      let data
      try {
        data = await s3Client.listObjectsV2({ Bucket: 'bucket-a', MaxKeys: 100 }).promise()
      } catch (e) {
        // mosty happen in node 18 with the error "EMFILE: too many open files"
        if (e.code === 'InternalError') {
          ctx.skip()
        }
      }
      expect(data.IsTruncated).to.be.true
      expect(data.Contents).to.have.lengthOf(100)
      expect(data.KeyCount).to.equal(100)
      expect(data.NextContinuationToken).to.exist
    }, 30000)

    it('lists additional objects using a continuation token', async (ctx) => {
      await generateTestObjects(s3Client, 'bucket-a', 500)
      let data
      try {
        data = await s3Client.listObjectsV2({ Bucket: 'bucket-a', MaxKeys: 400 }).promise()
      } catch (e) {
        // mosty happen in node 18 with the error "EMFILE: too many open files"
        if (e.code === 'InternalError') {
          ctx.skip()
        }
      }
      expect(data.IsTruncated).to.be.true
      expect(data.Contents).to.have.lengthOf(400)
      expect(data.NextContinuationToken).to.exist
      const nextData = await s3Client
        .listObjectsV2({
          Bucket: 'bucket-a',
          ContinuationToken: data.NextContinuationToken,
        })
        .promise()
      expect(nextData.Contents).to.have.lengthOf(100)
      expect(nextData.ContinuationToken).to.equal(data.NextContinuationToken)
      expect(nextData.NextContinuationToken).to.not.exist
    }, 30000)
  })

  describe('GET Bucket location', () => {
    it('returns default bucket location', async () => {
      const location = await s3Client
        .getBucketLocation({
          Bucket: 'bucket-a',
        })
        .promise()
      expect(location).to.have.property('LocationConstraint', '')
    })
  })

  describe('PUT Bucket', () => {
    it('creates a bucket with valid domain-style name', async () => {
      await s3Client.createBucket({ Bucket: 'a-test.example.com' }).promise()
    })

    it('fails to create a bucket because of invalid name', async () => {
      let error
      try {
        await s3Client.createBucket({ Bucket: '-$%!nvalid' }).promise()
      } catch (err) {
        error = err
        expect(err.statusCode).to.equal(400)
        expect(err.code).to.equal('InvalidBucketName')
      }
      expect(error).to.exist
    })

    it('fails to create a bucket because of invalid domain-style name', async () => {
      let error
      try {
        await s3Client.createBucket({ Bucket: '.example.com' }).promise()
      } catch (err) {
        error = err
        expect(err.statusCode).to.equal(400)
        expect(err.code).to.equal('InvalidBucketName')
      }
      expect(error).to.exist
    })

    it('fails to create a bucket because name is too long', async () => {
      let error
      try {
        await s3Client.createBucket({ Bucket: 'abcd'.repeat(16) }).promise()
      } catch (err) {
        error = err
        expect(err.statusCode).to.equal(400)
        expect(err.code).to.equal('InvalidBucketName')
      }
      expect(error).to.exist
    })

    it('fails to create a bucket because name is too short', async () => {
      let error
      try {
        await s3Client.createBucket({ Bucket: 'ab' }).promise()
      } catch (err) {
        error = err
        expect(err.statusCode).to.equal(400)
        expect(err.code).to.equal('InvalidBucketName')
      }
      expect(error).to.exist
    })
  })

  describe('PUT Bucket cors', () => {
    it('puts a CORS configuration in an unconfigured bucket', async () => {
      await s3Client
        .putBucketCors({
          Bucket: 'bucket-a',
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: ['*'],
                AllowedMethods: ['GET', 'HEAD'],
              },
            ],
          },
        })
        .promise()
      await s3Client.getBucketCors({ Bucket: 'bucket-a' }).promise()
    })
  })

  describe('PUT Bucket website', () => {
    it('puts a website configuration in an unconfigured bucket', async () => {
      await s3Client
        .putBucketWebsite({
          Bucket: 'bucket-a',
          WebsiteConfiguration: {
            IndexDocument: {
              Suffix: 'index.html',
            },
          },
        })
        .promise()
      await s3Client.getBucketWebsite({ Bucket: 'bucket-a' }).promise()
    })
  })
})
