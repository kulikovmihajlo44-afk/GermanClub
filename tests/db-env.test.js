const assert = require('assert'); const path = require('path');
const names = ['DATABASE_URL','POSTGRES_URL','STORAGE_DATABASE_URL','STORAGE_DATABASE_URL_UNPOOLED','STORAGE_URL','OTHER'];
function fresh(env) { names.forEach((n) => delete process.env[n]); Object.assign(process.env, env); delete require.cache[require.resolve('../lib/db.js')]; return require('../lib/db.js'); }
let db = fresh({}); assert.strictEqual(db.configured(), false); console.log('  ✓ no variables: not configured');
db = fresh({ DATABASE_URL: 'postgresql://a' }); assert.strictEqual(db.configured(), true); console.log('  ✓ plain DATABASE_URL');
db = fresh({ STORAGE_DATABASE_URL_UNPOOLED: 'postgresql://unpooled', STORAGE_DATABASE_URL: 'postgresql://pooled', OTHER: 'hello' }); assert.strictEqual(db.configured(), true); console.log('  ✓ prefixed STORAGE_DATABASE_URL is found');
db = fresh({ OTHER: 'hello', STORAGE_URL: 'https://not-a-db' }); assert.strictEqual(db.configured(), false); console.log('  ✓ unrelated variables are ignored');
console.log('db-env: 4 checks passed');
