# @aurostack/secrets

Fetch secrets from [Infisical](https://infisical.com) into env files. Each project only needs an `infisical.jsonc`.

It has no runtime dependencies. You need Node 20+ and the [Infisical CLI](https://infisical.com/docs/cli/overview), logged in with `infisical login`.

## Install

```sh
npm i -D @aurostack/secrets
```

## Configure

```sh
npx secrets init
```

This creates a commented `infisical.jsonc` in the current directory with every option filled in, ready to edit. If `.infisical.json` (from `infisical init`) is present, `projectId` is copied from its `workspaceId`. Pass `--force` to overwrite an existing config.

A minimal config looks like this:

```jsonc
{
  "$schema": "./node_modules/@aurostack/secrets/schema.json",
  "projectId": "2b690ec2-2993-4505-a42f-decfbf23b386",
  "path": "/backend"
}
```

The file is JSONC, so comments and trailing commas are allowed. It's separate from `.infisical.json`, which is the Infisical CLI's own file.

| Key            | Required | Default        | Description                                                        |
| -------------- | -------- | -------------- | ------------------------------------------------------------------ |
| `projectId`    | yes      |                | Infisical project id                                               |
| `path`         | no       | project root   | Infisical folder path                                              |
| `defaultEnv`   | no       | `dev`*         | Environment used when `--env` is not given (slug or alias)         |
| `environments` | no       | see below      | Keyed by Infisical env slug. When set, only these environments exist |

\* If there is no `dev` environment, the first environment listed is used.

Default environments:

| Slug      | Aliases       | File              |
| --------- | ------------- | ----------------- |
| `dev`     | `development` | `.env`            |
| `test`    | `testing`     | `.env.test`       |
| `staging` |               | `.env.staging`    |
| `prod`    | `production`  | `.env.production` |

If you leave out `environments`, you get all four. If you set it, only the environments you list exist. For a built-in slug, any `aliases` or `file` you leave out keep the values above. Other slugs need a `file`:

```jsonc
{
  "projectId": "...",
  "environments": {
    "dev": {},                                   // development alias, .env
    "prod": { "file": ".env.prod" },             // production alias, .env.prod
    "qa": { "aliases": ["uat"], "file": ".env.qa" }
  }
  // test and staging are not available
}
```

Env file paths are relative to the config file. The CLI looks for the config in the current directory, then each parent directory, so it also works from subfolders.

## Use

```jsonc
// package.json
"scripts": {
  "secrets": "secrets",
  "secrets:prod": "secrets -e production"
}
```

```sh
secrets init                    # create infisical.jsonc
secrets                         # defaultEnv
secrets -e test                 # slug or alias
secrets -e prod -p /worker      # override the folder path
secrets -c ./config/infisical.jsonc  # explicit config file
secrets -e dev -- --domain=https://infisical.example.com   # extra args for `infisical export`
```

Secrets are written to a temp file, which replaces the env file only after `infisical` succeeds. A failed fetch leaves the existing file untouched and exits non-zero.

## Programmatic API

```ts
import { loadConfig, resolveEnvironment, fetchSecrets } from '@aurostack/secrets';

const config = loadConfig();
const env = resolveEnvironment(config, 'production');
await fetchSecrets({ projectId: config.projectId, path: config.path, env: env.slug, file: env.file });
```

## Development

```sh
npm ci
npm test                         # builds, then runs the node:test suite
node scripts/check-package.mjs   # after a build: the npm package holds dist, schema, README, LICENSE only
```

### Releasing

```sh
npm version patch        # or minor / major: bumps package.json, commits, tags vX.Y.Z
git push --follow-tags
```

The tag runs the full CI (`.github/workflows/ci.yml`: build and tests on Node 20, 22 and 24, plus the package contents check). Then `release.yml` stages the version on npm and creates the GitHub release.

A staged version goes live only once a maintainer approves it with 2FA:

```sh
npm stage list @aurostack/secrets
npm stage approve <stage-id>     # or npmjs.com → the package → Staged Packages
```

CI authenticates as an npm **trusted publisher**, so there is no token. The publisher is configured as repository `aurostack-org/secrets`, workflow `release.yml`, environment `npm`, and is allowed to stage only. The `npm` GitHub environment is restricted to `v*` tags.
