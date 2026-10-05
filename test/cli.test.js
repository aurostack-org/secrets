import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, chmodSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

// A fake `infisical` that echoes its args, or fails when FAKE_FAIL is set.
const setup = () => {
    const dir = mkdtempSync(join(tmpdir(), 'secrets-'));
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'infisical'), '#!/bin/sh\nif [ -n "$FAKE_FAIL" ]; then echo boom >&2; exit 3; fi\necho "ARGS=\'$*\'"\n');
    chmodSync(join(bin, 'infisical'), 0o755);
    writeFileSync(join(dir, 'infisical.jsonc'), JSON.stringify({ projectId: 'p1', path: '/backend' }));
    const nested = join(dir, 'sub');
    mkdirSync(nested);
    const run = (args, env = {}) =>
        spawnSync(process.execPath, [cli, ...args], { cwd: nested, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ...env } });
    return { dir, run };
};

test('finds config in a parent dir and writes the mapped file', () => {
    const { dir, run } = setup();
    const r = run(['-e', 'production', '--', '--format=dotenv']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(join(dir, '.env.production'), 'utf8'), "ARGS='export --projectId=p1 --env=prod --path=/backend --format=dotenv'\n");
});

test('failure keeps the existing env file and exits non-zero', () => {
    const { dir, run } = setup();
    writeFileSync(join(dir, '.env'), 'OLD=1\n');
    const r = run([], { FAKE_FAIL: '1' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /exited with code 3/);
    assert.equal(readFileSync(join(dir, '.env'), 'utf8'), 'OLD=1\n');
});

test('rejects unknown env and stray positionals', () => {
    const { run } = setup();
    assert.match(run(['-e', 'qa']).stderr, /Unknown environment "qa"/);
    assert.match(run(['prod']).stderr, /Unexpected argument "prod"/);
});

test('missing config is reported', () => {
    const dir = mkdtempSync(join(tmpdir(), 'secrets-none-'));
    const r = spawnSync(process.execPath, [cli], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /No infisical.jsonc found/);
    assert.equal(existsSync(join(dir, '.env')), false);
});
