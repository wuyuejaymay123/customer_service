/**
 * Ensure sqlite3 loads N-API / Electron ABI prebuilds without node-gyp.
 * Stock sqlite3-binding.js only uses bindings(), which fails on Node 24 hosts.
 */
const fs = require('fs');
const path = require('path');

const bindingJs = path.join(
  __dirname,
  '../../release/app/node_modules/sqlite3/lib/sqlite3-binding.js',
);

const patched = `try {
  module.exports = require('./binding/napi-v6-win32-unknown-x64/node_sqlite3.node');
} catch (e1) {
  try {
    module.exports = require('./binding/node-v116-win32-x64/node_sqlite3.node');
  } catch (e2) {
    module.exports = require('bindings')('node_sqlite3.node');
  }
}
`;

if (fs.existsSync(bindingJs)) {
  fs.writeFileSync(bindingJs, patched, 'utf8');
  console.log('[ensure-sqlite3-binding] patched', bindingJs);
}
