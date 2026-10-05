import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_FILE, ConfigError, DEFAULT_ENVIRONMENTS } from './config.js';
import { parseJsonc } from './jsonc.js';

export interface InitOptions {
    dir?: string;
    /** Overwrite an existing config file. */
    force?: boolean;
}

/** Reads the project id that `infisical init` stores in .infisical.json, if any. */
export const detectProjectId = (dir: string): string | undefined => {
    try {
        const { workspaceId } = parseJsonc(readFileSync(join(dir, '.infisical.json'), 'utf8')) as { workspaceId?: unknown };
        return typeof workspaceId === 'string' && workspaceId ? workspaceId : undefined;
    } catch {
        return undefined;
    }
};

export const renderTemplate = (projectId = ''): string => {
    const width = Math.max(...Object.keys(DEFAULT_ENVIRONMENTS).map((slug) => slug.length));
    const environments = Object.entries(DEFAULT_ENVIRONMENTS)
        .map(([slug, env]) => {
            const key = `${JSON.stringify(slug)}:`.padEnd(width + 3);
            return `    ${key} { "aliases": ${JSON.stringify(env.aliases)}, "file": ${JSON.stringify(env.file)} }`;
        })
        .join(',\n');

    return `// @aurostack/secrets: fetches secrets from Infisical into env files.
// Run \`secrets\` (or \`secrets -e <env>\`) to fetch. See \`secrets --help\`.
{
  // Editor autocomplete and validation for this file.
  "$schema": "./node_modules/@aurostack/secrets/schema.json",

  // Required. Infisical project id: Project Settings in Infisical, or the
  // "workspaceId" in .infisical.json after running \`infisical init\`.
  "projectId": ${JSON.stringify(projectId)},

  // Infisical folder to export from, e.g. "/backend". "/" is the project root.
  // Override per run with \`secrets -p /other\`.
  "path": "/",

  // Environment fetched when no --env is given. A slug or an alias.
  // Defaults to "dev", or the first environment below if there is no "dev".
  "defaultEnv": "dev",

  // Keyed by Infisical environment slug (as shown in Infisical).
  //   aliases: other names accepted by --env, e.g. \`secrets -e production\`
  //   file:    env file to write, relative to this config file
  // Only the environments listed here exist, so delete any you don't use.
  // For the built-in slugs (dev, test, staging, prod) aliases and file are
  // optional and default to the values shown, e.g. "dev": {} is enough.
  // Other slugs need a file:
  //   "qa": { "aliases": ["uat"], "file": ".env.qa" }
  "environments": {
${environments}
  }
}
`;
};

/** Writes a commented config template into `dir` and returns its path. */
export const initConfig = ({ dir = process.cwd(), force = false }: InitOptions = {}): string => {
    const file = join(dir, CONFIG_FILE);
    if (existsSync(file) && !force) {
        throw new ConfigError(`${CONFIG_FILE} already exists. Use --force to overwrite it`);
    }
    writeFileSync(file, renderTemplate(detectProjectId(dir)));
    return file;
};
