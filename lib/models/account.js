class AWSAccount {
  constructor(accountId, displayName) {
    this.id = accountId
    this.displayName = displayName
    this.accessKeys = new Map()
  }

  createKeyPair(accessKeyId, secretAccessKey) {
    AWSAccount.registry.set(accessKeyId, this)
    this.accessKeys.set(accessKeyId, secretAccessKey)
  }

  revokeAccessKey(accessKeyId) {
    AWSAccount.registry.delete(accessKeyId)
    this.accessKeys.delete(accessKeyId)
  }
}
AWSAccount.registry = new Map()

module.exports = AWSAccount

// Hardcoded dummy user used for authenticated requests
module.exports.DUMMY_ACCOUNT = new AWSAccount(123456789000, 'S3rver')
module.exports.DUMMY_ACCOUNT.createKeyPair('S3RVER', 'S3RVER')
