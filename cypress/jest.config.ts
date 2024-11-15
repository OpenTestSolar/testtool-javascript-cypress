import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    "**/tests/**/*.ts",
  ],
  coverageThreshold: {
    global: {
      branches: 80,
    },
  },
};

export default config;