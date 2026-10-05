import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonc, renderTemplate, normalizeConfig, DEFAULT_ENVIRONMENTS } from '../dist/index.js';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const run = (cwd, args) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });

test('parseJsonc strips comments and trailing commas but not string contents', () => {
    const text = `// top
    {
      "url": "https://x.io/a//b", /* block */
      "s": "say \\"/* hi */\\"",
      "list": [1, 2,],
    }`;
    assert.deepEqual(parseJsonc(text), { url: 'https://x.io/a//b', s: 'say "/* hi */"', list: [1, 2] });
});

test('template parses to the built-in defaults', () => {
    const raw = parseJsonc(renderTemplate('p1'));
    const config = normalizeConfig(raw, '/proj');
    assert.equal(config.projectId, 'p1');
    assert.deepEqual(config.environments, DEFAULT_ENVIRONMENTS);
});

test('template with no project id fails until it is filled in', () => {
    assert.throws(() => normalizeConfig(parseJsonc(renderTemplate()), '/proj'), /"projectId" is required/);
});

test('init creates the config, prefills the project id and refuses to overwrite', () => {
    const dir = mkdtempSync(join(tmpdir(), 'secrets-init-'));
    writeFileSync(join(dir, '.infisical.json'), JSON.stringify({ workspaceId: 'ws-1' }));
    const file = join(dir, 'infisical.jsonc');

    assert.equal(run(dir, ['init']).status, 0);
    assert.equal(parseJsonc(readFileSync(file, 'utf8')).projectId, 'ws-1');

    writeFileSync(file, '{ "projectId": "edited" }');
    const again = run(dir, ['init']);
    assert.equal(again.status, 1);
    assert.match(again.stderr, /already exists/);
    assert.equal(readFileSync(file, 'utf8'), '{ "projectId": "edited" }');

    assert.equal(run(dir, ['init', '--force']).status, 0);
    assert.match(readFileSync(file, 'utf8'), /"projectId": "ws-1"/);
});
