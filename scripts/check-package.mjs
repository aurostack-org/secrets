#!/usr/bin/env node
/**
 * Fail unless the npm package ships the build output (.js and .d.ts) of every
 * source module, plus the schema, README and LICENSE, and nothing else: no
 * sources, tests or env files. Run after `npm run build`.
 */
import { execSync } from 'node:child_process';

// Older npm prints an array of packages, newer npm an object keyed by name.
const output = JSON.parse(
    execSync('npm pack --dry-run --json --ignore-scripts', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
);
const [pkg] = Array.isArray(output) ? output : Object.values(output);
const packed = new Set(pkg.files.map((f) => f.path));

const modules = execSync('git ls-files src', { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((f) => f.replace(/^src\//, 'dist/').replace(/\.ts$/, ''));
const expected = [
    ...modules.flatMap((m) => [`${m}.js`, `${m}.d.ts`]),
    'schema.json',
    'README.md',
    'LICENSE',
    'package.json'
];

const missing = expected.filter((f) => !packed.has(f));
const unexpected = [...packed].filter((f) => !expected.includes(f));

if (missing.length || unexpected.length) {
    if (missing.length) console.error('Not in the package:\n  ' + missing.join('\n  '));
    if (unexpected.length) console.error('Must not be in the package:\n  ' + unexpected.join('\n  '));
    process.exit(1);
}
console.log(`${pkg.name}@${pkg.version}: ${packed.size} files, all ${modules.length} modules built`);
