import { execFile } from 'node:child_process';
import { cp, mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const TSX_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');

/**
 * End-to-end CLI tests for `npm run db:seed` / `npm run db:reset`. Both
 * scripts hardcode `./data/myrio.db` (relative to `process.cwd()`) — SPEC-001
 * forbids any test touching the real `./data/myrio.db`, so every spawn here
 * overrides `cwd` to a fresh temp directory. Node resolves the script itself
 * (an absolute path) and its imports independently of `cwd`, so this only
 * redirects where `./data/myrio.db` and `./public/uploads/seed/` land.
 * `runMigrations` (Data Layer, `client.ts`) also resolves its `drizzle/`
 * folder from `process.cwd()`, so each temp dir gets its own copy.
 */
async function makeCwdWithMigrations(prefix: string): Promise<string> {
  const cwd = await mkdtemp(path.join(tmpdir(), prefix));
  await cp(path.join(REPO_ROOT, 'drizzle'), path.join(cwd, 'drizzle'), { recursive: true });
  return cwd;
}

describe('db:seed / db:reset CLI (spawned, cwd redirected to a temp dir)', () => {
  it('npm run db:seed equivalent: exits 0 and produces the seeded db file at <cwd>/data/myrio.db', async () => {
    const cwd = await makeCwdWithMigrations('myrio-cli-seed-');
    const scriptPath = path.join(REPO_ROOT, 'src/server/db/seed/index.ts');

    const { stdout } = await execFileAsync(TSX_BIN, [scriptPath], { cwd, timeout: 30_000 });
    expect(stdout).toContain('Seed complete');
    expect(existsSync(path.join(cwd, 'data', 'myrio.db'))).toBe(true);
    expect(existsSync(path.join(cwd, 'public', 'uploads', 'seed', 'avatar-elena-marsh.png'))).toBe(true);
  }, 30_000);

  it('npm run db:reset -- --force equivalent: exits 0 non-interactively on an empty dir', async () => {
    const cwd = await makeCwdWithMigrations('myrio-cli-reset-');
    const scriptPath = path.join(REPO_ROOT, 'src/server/db/seed/reset.ts');

    const { stdout } = await execFileAsync(TSX_BIN, [scriptPath, '--force'], { cwd, timeout: 30_000 });
    expect(stdout).toContain('Reset complete');
    expect(existsSync(path.join(cwd, 'data', 'myrio.db'))).toBe(true);
  }, 30_000);

  it('npm run db:reset (no --force): prints row counts and aborts on non-"y" input, without creating a db', async () => {
    const cwd = await makeCwdWithMigrations('myrio-cli-reset-abort-');
    const scriptPath = path.join(REPO_ROOT, 'src/server/db/seed/reset.ts');

    const child = execFile(TSX_BIN, [scriptPath], { cwd, timeout: 30_000 });
    child.stdin?.write('n\n');
    child.stdin?.end();

    const exitCode: number = await new Promise((resolve) => {
      child.on('exit', (code) => resolve(code ?? 0));
    });

    expect(exitCode).not.toBe(0);
    expect(existsSync(path.join(cwd, 'data', 'myrio.db'))).toBe(false);
  }, 30_000);

  it('npm run db:reset (no --force) then "y": deletes, migrates and seeds, exits 0', async () => {
    const cwd = await makeCwdWithMigrations('myrio-cli-reset-confirm-');
    const scriptPath = path.join(REPO_ROOT, 'src/server/db/seed/reset.ts');

    // Seed once first so the confirm prompt has real rows to report on.
    await execFileAsync(TSX_BIN, [path.join(REPO_ROOT, 'src/server/db/seed/index.ts')], {
      cwd,
      timeout: 30_000,
    });

    const child = execFile(TSX_BIN, [scriptPath], { cwd, timeout: 30_000 });
    let stdout = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stdin?.write('y\n');
    child.stdin?.end();

    const exitCode: number = await new Promise((resolve) => {
      child.on('exit', (code) => resolve(code ?? 0));
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('This will DESTROY');
    expect(stdout).toContain('Reset complete');
  }, 30_000);
});
