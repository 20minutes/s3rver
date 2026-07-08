const { zip } = require('lodash')
const os = require('node:os')
const axios = require('axios')

const { createServerAndClient, isValidDate, parseXml } = require('../helpers')

describe('Virtual Host resolution', () => {
  const buckets = [{ name: 'bucket-a' }, { name: 'bucket-b' }]

  it('lists objects with subdomain-domain style bucket access', async () => {
    const { s3Client } = await createServerAndClient({
      configureBuckets: buckets,
    })
    const res = await axios(s3Client.endpoint.href, {
      headers: { host: 'bucket-a.s3.amazonaws.com' },
    })
    expect(res.data).to.include(`<Name>bucket-a</Name>`)
  })

  it('lists objects with a vhost-style bucket access', async () => {
    const { s3Client } = await createServerAndClient({
      configureBuckets: buckets,
    })
    const res = await axios(s3Client.endpoint.href, {
      headers: { host: 'bucket-a' },
    })
    expect(res.data).to.include(`<Name>bucket-a</Name>`)
  })

  it('lists buckets when vhost-style bucket access is disabled', async () => {
    const { s3Client } = await createServerAndClient({
      vhostBuckets: false,
      configureBuckets: buckets,
    })
    const res = await axios(s3Client.endpoint.href, {
      headers: { host: 'bucket-a' },
    })
    const parsedBody = parseXml(res.data)
    expect(parsedBody).to.haveOwnProperty('ListAllMyBucketsResult')
    const parsedBuckets = parsedBody.ListAllMyBucketsResult.Buckets.Bucket
    expect(parsedBuckets).to.be.instanceOf(Array)
    expect(parsedBuckets).to.have.lengthOf(buckets.length)
    for (const [bucket, config] of zip(parsedBuckets, buckets)) {
      expect(bucket.Name).to.equal(config.name)
      expect(isValidDate(bucket.CreationDate)).to.be.true
    }
  })

  it('lists buckets at a custom service endpoint', async () => {
    const { s3Client } = await createServerAndClient({
      serviceEndpoint: 'example.com',
      configureBuckets: buckets,
    })
    const res = await axios(s3Client.endpoint.href, {
      headers: { host: 's3.example.com' },
    })
    const parsedBody = parseXml(res.data)
    expect(parsedBody).to.haveOwnProperty('ListAllMyBucketsResult')
    const parsedBuckets = parsedBody.ListAllMyBucketsResult.Buckets.Bucket
    expect(parsedBuckets).to.be.instanceOf(Array)
    expect(parsedBuckets).to.have.lengthOf(buckets.length)
    for (const [bucket, config] of zip(parsedBuckets, buckets)) {
      expect(bucket.Name).to.equal(config.name)
      expect(isValidDate(bucket.CreationDate)).to.be.true
    }
  })

  it('lists buckets at the OS hostname', async () => {
    const { s3Client } = await createServerAndClient({
      configureBuckets: buckets,
    })
    const res = await axios(s3Client.endpoint.href, {
      headers: { host: os.hostname() },
    })
    const parsedBody = parseXml(res.data)
    expect(parsedBody).to.haveOwnProperty('ListAllMyBucketsResult')
    const parsedBuckets = parsedBody.ListAllMyBucketsResult.Buckets.Bucket
    expect(parsedBuckets).to.be.instanceOf(Array)
    expect(parsedBuckets).to.have.lengthOf(buckets.length)
    for (const [bucket, config] of zip(parsedBuckets, buckets)) {
      expect(bucket.Name).to.equal(config.name)
      expect(isValidDate(bucket.CreationDate)).to.be.true
    }
  })

  it('lists objects in a bucket at a custom service endpoint', async () => {
    const { s3Client } = await createServerAndClient({
      serviceEndpoint: 'example.com',
      configureBuckets: buckets,
    })
    const res = await axios(s3Client.endpoint.href, {
      headers: { host: 'bucket-a.s3.example.com' },
    })
    const parsedBody = parseXml(res.data)
    expect(parsedBody.ListBucketResult.Name).to.equal('bucket-a')
  })
})
