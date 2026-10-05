import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { normalizeConfig, resolveEnvironment, ConfigError } from '../dist/index.js';
import { buildArgs } from '../dist/fetch.js';

const root = '/proj';

test('applies default environments and aliases', () => {
    const config = normalizeConfig({ projectId: 'abc' }, root);
    assert.equal(config.defaultEnv, 'dev');
    assert.deepEqual(resolveEnvironment(config, 'development'), { slug: 'dev', file: resolve(root, '.env') });
    assert.deepEqual(resolveEnvironment(config, 'production'), { slug: 'prod', file: resolve(root, '.env.production') });
    assert.equal(resolveEnvironment(config, 'staging').slug, 'staging');
});

test('listed environments replace the defaults; built-in slugs fill missing fields', () => {
    const config = normalizeConfig(
        {
            projectId: 'abc',
            environments: { dev: {}, prod: { file: '.env.prod' }, qa: { aliases: ['uat'], file: '.env.qa' } }
        },
        root
    );
    assert.deepEqual(Object.keys(config.environments), ['dev', 'prod', 'qa']);
    assert.deepEqual(resolveEnvironment(config, 'development'), { slug: 'dev', file: resolve(root, '.env') });
    assert.deepEqual(resolveEnvironment(config, 'production'), { slug: 'prod', file: resolve(root, '.env.prod') });
    assert.equal(resolveEnvironment(config, 'uat').slug, 'qa');
    assert.throws(() => resolveEnvironment(config, 'test'), /Choose one of: dev, development, prod, production, qa, uat$/);
});

test('defaultEnv falls back to the first environment when there is no dev', () => {
    const config = normalizeConfig({ projectId: 'abc', environments: { staging: {}, prod: {} } }, root);
    assert.equal(config.defaultEnv, 'staging');
    assert.throws(
        () => normalizeConfig({ projectId: 'abc', defaultEnv: 'test', environments: { dev: {}, prod: {} } }, root),
        /"defaultEnv" is "test", which is not a configured environment. Choose one of: dev, development, prod, production/
    );
});

test('rejects bad config', () => {
    assert.throws(() => normalizeConfig({}, root), ConfigError);
    assert.throws(() => normalizeConfig({ projectId: 'abc', defaultEnv: 'nope' }, root), /"defaultEnv" is "nope"/);
    assert.throws(() => normalizeConfig({ projectId: 'abc', environments: {} }, root), /at least one environment/);
    assert.throws(() => normalizeConfig({ projectId: 'abc', environments: { qa: {} } }, root), /file is required/);
    assert.throws(() => normalizeConfig({ projectId: 'abc', environments: { qa: { file: '.env.qa', aliases: 'x' } } }, root), /aliases/);
});

test('unknown environment lists choices', () => {
    const config = normalizeConfig({ projectId: 'abc' }, root);
    assert.throws(() => resolveEnvironment(config, 'qa'), /Choose one of: dev, development, test, testing, staging, prod, production/);
});

test('builds infisical args', () => {
    assert.deepEqual(buildArgs({ projectId: 'abc', env: 'dev', path: '/backend', file: 'x', extraArgs: ['--format=json'] }), [
        'export', '--projectId=abc', '--env=dev', '--path=/backend', '--format=json'
    ]);
    assert.deepEqual(buildArgs({ projectId: 'abc', env: 'prod', file: 'x' }), ['export', '--projectId=abc', '--env=prod']);
});
