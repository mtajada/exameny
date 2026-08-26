#!/usr/bin/env node

/**
 * Validate browser-safe build configuration without ever printing values.
 * Server credentials are intentionally forbidden in this frontend project.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const REQUIRED_FRONTEND = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
];

const FORBIDDEN_SERVER_ONLY = [
  'OPENAI_API_KEY',
  'RESEND_API_KEY',
  'SUPABASE_DB_URL',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'UPSTASH_REDIS_REST_TOKEN',
];

const SAFE_PUBLIC_KEY_NAMES = new Set(['VITE_SUPABASE_PUBLISHABLE_KEY']);
const SENSITIVE_NAME_PATTERN = /(SECRET|TOKEN|PASSWORD|PRIVATE|API_KEY)/i;

function loadEnvFile(filePath) {
  try {
    return dotenv.parse(fs.readFileSync(filePath));
  } catch {
    return null;
  }
}

function isPlaceholder(value) {
  return /^(replace[-_ ]with|example|changeme|todo)/i.test(value.trim());
}

function isLoopbackHostname(hostname) {
  const normalized = hostname.toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '[::1]';
}

function validateSupabaseUrl(rawValue, mode) {
  if (rawValue !== rawValue.trim() || /["']/.test(rawValue)) {
    return 'must not contain quotes or surrounding whitespace';
  }

  try {
    const parsed = new URL(rawValue);
    const allowedProtocol = parsed.protocol === 'https:'
      || (mode !== 'production' && parsed.protocol === 'http:' && isLoopbackHostname(parsed.hostname));
    const cleanOrigin = parsed.username === ''
      && parsed.password === ''
      && parsed.pathname === '/'
      && parsed.search === ''
      && parsed.hash === '';

    if (!allowedProtocol) {
      return mode === 'production'
        ? 'must use HTTPS in production'
        : 'must use HTTPS or loopback HTTP';
    }
    if (!cleanOrigin) {
      return 'must be an origin without credentials, path, query, or fragment';
    }
  } catch {
    return 'must be a valid URL';
  }

  return null;
}

function validateEnvironment(envVars, mode = 'production', { isDeployment = false, allowPlaceholders = false } = {}) {
  const errors = [];
  const warnings = [];

  for (const name of REQUIRED_FRONTEND) {
    const value = envVars[name];
    if (
      typeof value !== 'string'
      || value.trim() === ''
      || (!allowPlaceholders && isPlaceholder(value))
    ) {
      errors.push(`${name}: missing or still a placeholder`);
    }
  }

  const url = envVars.VITE_SUPABASE_URL;
  if (typeof url === 'string' && url.trim() !== '' && !isPlaceholder(url)) {
    const error = validateSupabaseUrl(url, mode);
    if (error) {
      errors.push(`VITE_SUPABASE_URL: ${error}`);
    }
  }

  const publishableKey = envVars.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (
    typeof publishableKey === 'string'
    && publishableKey.trim() !== ''
    && !isPlaceholder(publishableKey)
    && !publishableKey.startsWith('sb_publishable_')
  ) {
    warnings.push('VITE_SUPABASE_PUBLISHABLE_KEY: unexpected public-key format');
  }

  if (isDeployment) {
    for (const name of FORBIDDEN_SERVER_ONLY) {
      if (typeof envVars[name] === 'string' && envVars[name].trim() !== '') {
        errors.push(`${name}: server-only variable is not allowed in the deployment environment`);
      }
    }
  }

  for (const name of Object.keys(envVars)) {
    if (
      name.startsWith('VITE_')
      && SENSITIVE_NAME_PATTERN.test(name)
      && !SAFE_PUBLIC_KEY_NAMES.has(name)
    ) {
      errors.push(`${name}: potentially sensitive variable must not use the VITE_ prefix`);
    }
  }

  console.log(`Exameny public environment check (${mode})`);
  for (const error of errors) {
    console.error(`ERROR ${error}`);
  }
  for (const warning of warnings) {
    console.warn(`WARN ${warning}`);
  }
  console.log(errors.length === 0 ? 'PASS' : 'FAIL');

  return errors.length === 0;
}

function main() {
  const args = process.argv.slice(2);
  const modeArg = args.find((arg) => arg.startsWith('--mode='));
  const fileArg = args.find((arg) => arg.startsWith('--file='));
  const allowPlaceholders = args.includes('--allow-placeholders');
  const requestedMode = modeArg?.slice('--mode='.length) || 'production';
  const mode = requestedMode === 'development' ? 'development' : 'production';
  const runningOnVercel = process.env.VERCEL === '1';

  let envVars = process.env;
  if (!runningOnVercel) {
    const fileName = fileArg?.slice('--file='.length)
      || (mode === 'production' ? '.env.production' : '.env.development');
    const filePath = path.join(process.cwd(), fileName);
    envVars = loadEnvFile(filePath) || process.env;
    console.log(`Configuration source: ${fs.existsSync(filePath) ? fileName : 'process environment'}`);
  } else {
    console.log('Configuration source: deployment environment');
  }

  process.exit(validateEnvironment(envVars, mode, {
    isDeployment: runningOnVercel,
    allowPlaceholders: allowPlaceholders && !runningOnVercel,
  }) ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  loadEnvFile,
  validateEnvironment,
  validateSupabaseUrl,
};
