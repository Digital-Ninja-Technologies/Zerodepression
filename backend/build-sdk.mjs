// Bundles the Firebase SDK wrapper into one minified, self-hosted file.
import { build } from 'esbuild';
await build({
  entryPoints: ['src/zd-firebase.js'],
  outfile: '../assets/js/vendor/zd-firebase.js',
  bundle: true, minify: true, format: 'iife', target: ['es2019'], legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
});
console.log('built assets/js/vendor/zd-firebase.js');
