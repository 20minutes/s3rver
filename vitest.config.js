const { defineConfig } = require('vitest/config')

module.exports = defineConfig({
  test: {
    globals: true,
    setupFiles: ['./test/setup.js'],
    testTimeout: 10000,
    fileParallelism: false,
    isolate: false,
    watch: false,
    reporters: ['tree'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary'],
    },
  },
})
