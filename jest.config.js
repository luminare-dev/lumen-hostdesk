process.env.TZ = 'Europe/Vienna'; // dates in the fixtures and the formatters; one zone for every run
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/e2e/', '/tests/', '/web-build/', '/dist/'],
  collectCoverageFrom: ['src/api/**/*.ts', 'src/alerts/**/*.ts', 'src/state/servers.ts', 'src/state/settings.ts'],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$': '@react-native-async-storage/async-storage/jest/async-storage-mock',
  },
};
