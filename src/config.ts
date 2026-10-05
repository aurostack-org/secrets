import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseJsonc } from './jsonc.js';

/** JSONC: comments and trailing commas are allowed. */
export const CONFIG_FILE = 'infisical.jsonc';

export interface EnvironmentConfig {
    /** Other names accepted for this environment on the command line. */
    aliases?: string[];
    /** Env file to write, relative to the config file. */
    file?: string;
}

export interface SecretsConfig {
    /** Infisical project id. */
    projectId: string;
    /** Infisical folder path, e.g. "/backend". Omit for the project root. */
    path?: string;
    /** Environment used when no --env is given. Defaults to "dev", or the first environment if there is no "dev". */
    defaultEnv?: string;
    /**
     * Keyed by Infisical environment slug. When set, only these environments
     * exist; fields left out of a built-in slug (dev, test, ...) use its defaults.
     */
    environments?: Record<string, EnvironmentConfig>;
}

export interface LoadedConfig {
    projectId: string;
    path?: string;
    defaultEnv: string;
    environments: Record<string, Required<EnvironmentConfig>>;
    /** Directory containing the config file; env files are written here. */
    rootDir: string;
}

export interface ResolvedEnvironment {
    slug: string;
    file: string;
}

export const DEFAULT_ENVIRONMENTS: Record<string, Required<EnvironmentConfig>> = {
    dev: { aliases: ['development'], file: '.env' },
    test: { aliases: ['testing'], file: '.env.test' },
    staging: { aliases: [], file: '.env.staging' },
    prod: { aliases: ['production'], file: '.env.production' }
};

export class ConfigError extends Error {
    override name = 'ConfigError';
}

/** Walks up from `startDir` to find the nearest config file. */
export const findConfig = (startDir: string = process.cwd()): string | undefined => {
    let dir = resolve(startDir);
    for (;;) {
        const candidate = join(dir, CONFIG_FILE);
        if (existsSync(candidate)) return candidate;
        const parent = dirname(dir);
        if (parent === dir) return undefined;
        dir = parent;
    }
};

export const loadConfig = (configPath?: string): LoadedConfig => {
    const file = configPath ? resolve(configPath) : findConfig();
    if (!file || !existsSync(file)) {
        throw new ConfigError(
            configPath
                ? `Config file not found: ${configPath}`
                : `No ${CONFIG_FILE} found in ${process.cwd()} or any parent directory`
        );
    }

    let raw: unknown;
    try {
        raw = parseJsonc(readFileSync(file, 'utf8'));
    } catch (err) {
        throw new ConfigError(`Could not parse ${file}: ${(err as Error).message}`);
    }

    return normalizeConfig(raw, dirname(file), file);
};

export const normalizeConfig = (raw: unknown, rootDir: string, source = CONFIG_FILE): LoadedConfig => {
    if (!isObject(raw)) throw new ConfigError(`${source} must contain a JSON object`);

    const { projectId, path, defaultEnv, environments = DEFAULT_ENVIRONMENTS } = raw as Partial<SecretsConfig>;

    if (typeof projectId !== 'string' || !projectId.trim()) {
        throw new ConfigError(`${source}: "projectId" is required`);
    }
    if (path !== undefined && typeof path !== 'string') {
        throw new ConfigError(`${source}: "path" must be a string`);
    }
    if (defaultEnv !== undefined && typeof defaultEnv !== 'string') {
        throw new ConfigError(`${source}: "defaultEnv" must be a string`);
    }
    if (!isObject(environments) || Object.keys(environments).length === 0) {
        throw new ConfigError(`${source}: "environments" must be an object with at least one environment`);
    }

    const resolved: Record<string, Required<EnvironmentConfig>> = {};
    for (const [slug, env] of Object.entries(environments)) {
        if (!isObject(env)) throw new ConfigError(`${source}: environments.${slug} must be an object`);
        const { aliases, file } = env as EnvironmentConfig;
        if (aliases !== undefined && !(Array.isArray(aliases) && aliases.every((a) => typeof a === 'string'))) {
            throw new ConfigError(`${source}: environments.${slug}.aliases must be an array of strings`);
        }
        if (file !== undefined && typeof file !== 'string') {
            throw new ConfigError(`${source}: environments.${slug}.file must be a string`);
        }
        const base = Object.hasOwn(DEFAULT_ENVIRONMENTS, slug) ? DEFAULT_ENVIRONMENTS[slug] : undefined;
        const resolvedFile = file ?? base?.file;
        if (!resolvedFile) throw new ConfigError(`${source}: environments.${slug}.file is required`);
        resolved[slug] = { aliases: aliases ?? base?.aliases ?? [], file: resolvedFile };
    }

    const config: LoadedConfig = {
        projectId,
        path,
        defaultEnv: defaultEnv ?? ('dev' in resolved ? 'dev' : Object.keys(resolved)[0]),
        environments: resolved,
        rootDir
    };
    try {
        resolveEnvironment(config, config.defaultEnv);
    } catch {
        throw new ConfigError(
            `${source}: "defaultEnv" is "${config.defaultEnv}", which is not a configured environment. ` +
                `Choose one of: ${environmentChoices(config).join(', ')}`
        );
    }
    return config;
};

/** Maps a slug or alias (e.g. "production") to its environment. */
export const resolveEnvironment = (config: LoadedConfig, name: string): ResolvedEnvironment => {
    for (const [slug, env] of Object.entries(config.environments)) {
        if (slug === name || env.aliases.includes(name)) {
            return { slug, file: resolve(config.rootDir, env.file) };
        }
    }
    throw new ConfigError(`Unknown environment "${name}". Choose one of: ${environmentChoices(config).join(', ')}`);
};

export const environmentChoices = (config: LoadedConfig): string[] =>
    Object.entries(config.environments).flatMap(([slug, env]) => [slug, ...env.aliases]);

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
