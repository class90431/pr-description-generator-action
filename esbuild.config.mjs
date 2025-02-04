import esbuild from 'esbuild'

esbuild
  .build({
    entryPoints: ['index.mjs'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outfile: 'dist/index.js',
    external: [],
    format: 'cjs'
  })
  .catch(() => process.exit(1))
