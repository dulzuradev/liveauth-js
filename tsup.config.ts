import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        'pow.worker': 'src/pow.worker.ts'
    },
    format: ['esm'],
    target: 'es2020',
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: true,
    outDir: 'dist'
});
