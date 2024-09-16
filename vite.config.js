import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'src/main.js'
      },
      output: {
        entryFileNames: '[name].js'
      },
      external: ['node-notifier']
    }
  }
});
