import { spawn } from 'node:child_process';
import { createWriteStream, renameSync, rmSync } from 'node:fs';

export interface FetchOptions {
    projectId: string;
    env: string;
    path?: string;
    /** Absolute path of the env file to write. */
    file: string;
    /** Extra arguments passed through to `infisical export`. */
    extraArgs?: string[];
    /** Infisical binary; defaults to `infisical` on PATH. */
    bin?: string;
}

export const buildArgs = ({ projectId, env, path, extraArgs = [] }: FetchOptions): string[] => [
    'export',
    `--projectId=${projectId}`,
    `--env=${env}`,
    ...(path ? [`--path=${path}`] : []),
    ...extraArgs
];

/**
 * Runs `infisical export` and writes its output to `file`. Output goes to a
 * temp file first, so a failed fetch never clobbers an existing env file.
 */
export const fetchSecrets = (options: FetchOptions): Promise<void> => {
    const { file, bin = 'infisical' } = options;
    const tmp = `${file}.${process.pid}.tmp`;

    return new Promise((resolvePromise, reject) => {
        const out = createWriteStream(tmp, { mode: 0o600 });
        const child = spawn(bin, buildArgs(options), { stdio: ['inherit', 'pipe', 'inherit'] });

        const fail = (err: Error) => {
            out.destroy();
            rmSync(tmp, { force: true });
            reject(err);
        };

        child.stdout.pipe(out);
        child.on('error', (err: NodeJS.ErrnoException) =>
            fail(
                err.code === 'ENOENT'
                    ? new Error(`"${bin}" not found. Install the Infisical CLI: https://infisical.com/docs/cli/overview`)
                    : err
            )
        );
        child.on('close', (code) => {
            if (code !== 0) return fail(new Error(`infisical exited with code ${code}`));
            out.end(() => {
                try {
                    renameSync(tmp, file);
                    resolvePromise();
                } catch (err) {
                    fail(err as Error);
                }
            });
        });
    });
};
