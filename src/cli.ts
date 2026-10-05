#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { parseArgs } from 'node:util';
import { CONFIG_FILE, ConfigError, loadConfig, resolveEnvironment } from './config.js';
import { fetchSecrets } from './fetch.js';
import { initConfig } from './init.js';

const HELP = `Usage:
  secrets [options] [-- <infisical export args>]
  secrets init [--force]

Fetch secrets from Infisical into the env file mapped in ${CONFIG_FILE}.

Commands:
  init                  Create a commented ${CONFIG_FILE} in the current directory

Options:
  -e, --env <name>      Environment slug or alias (default: config "defaultEnv")
  -c, --config <file>   Config file (default: nearest ${CONFIG_FILE})
  -p, --path <path>     Override the Infisical folder path
  -f, --force           init: overwrite an existing config file
  -h, --help            Show help
  -v, --version         Show version

Examples:
  secrets init                 # create the config, then edit it
  secrets                      # default environment
  secrets -e production        # aliases work too
  secrets -e dev -- --domain=https://secrets.example.com`;

const main = async (): Promise<number> => {
    const { values, tokens } = parseArgs({
        options: {
            env: { type: 'string', short: 'e' },
            config: { type: 'string', short: 'c' },
            path: { type: 'string', short: 'p' },
            force: { type: 'boolean', short: 'f' },
            help: { type: 'boolean', short: 'h' },
            version: { type: 'boolean', short: 'v' }
        },
        allowPositionals: true,
        tokens: true
    });

    if (values.help) {
        console.log(HELP);
        return 0;
    }
    if (values.version) {
        const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
        console.log(pkg.version);
        return 0;
    }

    // Before `--`, the only positional allowed is the `init` command; after it,
    // positionals are passthrough args for infisical.
    const terminator = tokens.findIndex((t) => t.kind === 'option-terminator');
    const commands = tokens.flatMap((t, i) =>
        t.kind === 'positional' && (terminator === -1 || i < terminator) ? [t.value] : []
    );
    const extraArgs = terminator === -1 ? [] : tokens.slice(terminator).flatMap((t) => (t.kind === 'positional' ? [t.value] : []));

    if (commands.length === 1 && commands[0] === 'init') {
        const file = initConfig({ force: values.force });
        console.log(`Created ${relative(process.cwd(), file)}. Set "projectId" if it's empty, adjust the rest, then run \`secrets\`.`);
        return 0;
    }
    if (commands.length > 0) {
        throw new ConfigError(`Unexpected argument "${commands[0]}". Use -e <env>, or put infisical args after --`);
    }

    const config = loadConfig(values.config);
    const env = resolveEnvironment(config, values.env ?? config.defaultEnv);
    const path = values.path ?? config.path;

    console.log(`Fetching secrets for '${env.slug}'${path ? ` (${path})` : ''} -> ${relative(process.cwd(), env.file) || env.file}`);
    await fetchSecrets({ projectId: config.projectId, env: env.slug, path, file: env.file, extraArgs });
    return 0;
};

main().then(
    (code) => process.exit(code),
    (err: Error) => {
        console.error(`secrets: ${err.message}`);
        process.exit(1);
    }
);
