module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/test/unit/**/*.test.js',
    '**/test/characterization/**/*.test.js',
    '**/test/architecture/**/*.test.js'
  ],
  testTimeout: 30000,
  verbose: true
};
