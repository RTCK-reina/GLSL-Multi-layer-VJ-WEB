import { context, build } from 'esbuild';

const isWatch = process.argv.includes('--watch');

const config = {
  entryPoints: ['src/main.js'],
  bundle: true,
  outfile: 'dist/app.bundle.js',
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  sourcemap: true,
  external: ['three'],
  define: {
    'process.env.NODE_ENV': isWatch ? '"development"' : '"production"',
  },
  minify: !isWatch,
  logLevel: 'info',
};

if (isWatch) {
  const ctx = await context(config);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await build(config);
}
