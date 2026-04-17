import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  REQUIRED_SHELL_FILES,
  assertChatbotV3BaselineShellFiles,
} from './check-chatbot-v3-baseline-shell.mjs';

const SCRIPT_PATH = fileURLToPath(new URL('./check-chatbot-v3-baseline-shell.mjs', import.meta.url));
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), '..');

test('root test script runs the baseline shell guard before turbo test', () => {
  const packageJson = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'));

  assert.equal(
    packageJson.scripts.test,
    'pnpm check:chatbot-v3-baseline-shell && turbo test',
  );
});

test('passes when all required shell files are present', () => {
  assert.doesNotThrow(() =>
    assertChatbotV3BaselineShellFiles({
      rootDir: process.cwd(),
    }),
  );
});

test('cli direct-run uses the script-derived default repo root instead of cwd', () => {
  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: resolve(REPO_ROOT, 'apps/api'),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Chatbot V3 baseline shell guard passed\./);
  assert.match(
    result.stdout,
    new RegExp(`Checked 6 required files from ${REPO_ROOT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  );
  assert.equal(result.stderr, '');
});

test('fails with a clear message when a required shell file is missing', () => {
  assert.throws(
    () =>
      assertChatbotV3BaselineShellFiles({
        rootDir: process.cwd(),
        requiredFiles: [...REQUIRED_SHELL_FILES, 'missing/file.ts'],
      }),
    (error) => {
      assert.match(error.message, /Chatbot V3 baseline shell guard failed/);
      assert.match(error.message, /missing\/file\.ts/);
      return true;
    },
  );
});
