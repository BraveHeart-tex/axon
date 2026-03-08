import path from 'path';

export default {
  test: {
    environment: 'node',
    clearMocks: true,
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
};
