import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@engine': resolve(__dirname, 'engine'),
      '@bot-protocol': resolve(__dirname, 'bot-protocol'),
      '@bot-runner': resolve(__dirname, 'bot-runner'),
      '@bot-executor': resolve(__dirname, 'bot-executor'),
      '@match-runner': resolve(__dirname, 'match-runner'),
      '@tournament': resolve(__dirname, 'tournament'),
    },
    extensions: ['.ts', '.js', '.json'],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});