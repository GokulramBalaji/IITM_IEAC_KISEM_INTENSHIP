/**
 * Executes the schema SQL and seeds all data via Supabase REST APIs.
 * Run: node run_schema.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

// Load environment variables from .env file if it exists
try {
  const envPaths = [path.join(__dirname, '.env'), path.join(__dirname, '..', '.env')];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
        const part = line.trim();
        if (part && !part.startsWith('#')) {
          const idx = part.indexOf('=');
          if (idx > 0) {
            const k = part.substring(0, idx).trim();
            let v = part.substring(idx + 1).trim();
            if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
            else if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
            if (!process.env[k]) process.env[k] = v;
          }
        }
      });
    }
  }
} catch (err) {}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://cxojeukkobhkrrrcwmoe.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || '';

function httpRequest(method, hostname, reqPath, headers, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const opts = {
      hostname,
      port: 443,
      path: reqPath,
      method,
      headers: { ...headers }
    };
    if (bodyStr) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function runSQL(sql) {
  const urlObj = new URL(SUPABASE_URL);
  const res = await httpRequest('POST', urlObj.hostname, '/rest/v1/rpc/exec_sql', {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
  }, { sql });
  return res;
}

async function main() {
  console.log('\n=== Running Database Schema Setup ===\n');

  const schemaPath = path.join(__dirname, 'supabase_schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  // Split by semicolons into individual statements
  const statements = schemaSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 5 && !s.startsWith('--'));

  console.log(`Running ${statements.length} SQL statements...`);

  let ok = 0;
  let errors = 0;
  for (const stmt of statements) {
    try {
      const res = await runSQL(stmt + ';');
      if (res.status >= 400) {
        const msg = typeof res.body === 'object' ? res.body.message || JSON.stringify(res.body) : res.body;
        // Ignore "already exists" type errors 
        if (!msg.includes('already exists') && !msg.includes('duplicate')) {
          console.error(`  ✗ Error: ${msg.substring(0, 100)}`);
          errors++;
        }
      } else {
        ok++;
      }
    } catch (e) {
      console.error(`  ✗ Exception: ${e.message}`);
    }
  }

  console.log(`\nSchema execution complete: ${ok} OK, ${errors} errors\n`);
}

main().catch(console.error);
