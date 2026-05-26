// Auto-bump the SW cache version to the current timestamp.
// Wired into firebase.json hosting.predeploy so we never have to bump manually.
//
// Replaces the line:
//     const CACHE = 'sfs-...'
// with:
//     const CACHE = 'sfs-<unix-timestamp>'
//
// This guarantees every deploy invalidates the previous SW cache cleanly —
// no more "user stuck on old version because we forgot to bump v".

const fs   = require('fs');
const path = require('path');

const swPath  = path.resolve(__dirname, '..', 'sw.js');
const before  = fs.readFileSync(swPath, 'utf8');
const version = 'sfs-' + Date.now();
const after   = before.replace(
  /const CACHE = ['"]sfs-[^'"]+['"]/,
  "const CACHE = '" + version + "'"
);

if (after === before) {
  console.error('[bump-sw-cache] Could not find CACHE constant in sw.js — aborting deploy.');
  process.exit(1);
}

fs.writeFileSync(swPath, after);
console.log('[bump-sw-cache] CACHE = ' + version);
