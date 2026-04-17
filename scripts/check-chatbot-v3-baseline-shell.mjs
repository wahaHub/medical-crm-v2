import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_ROOT_DIR = resolve(SCRIPT_DIR, '..');

export const REQUIRED_SHELL_FILES = [
  'apps/api/src/routes/chatbot-v3.routes.ts',
  'apps/api/src/routes/chatbot-v3/runtime.service.ts',
  'apps/api/src/routes/chatbot-v3/agents.ts',
  'packages/application/src/services/chatbot-v3/supervisor.service.ts',
  'packages/application/src/services/chatbot-v3/orchestrator-v3.service.ts',
  'packages/shared/validation/src/chatbot-v3/chat.schema.ts',
];

export function getMissingChatbotV3BaselineShellFiles({
  rootDir = DEFAULT_ROOT_DIR,
  requiredFiles = REQUIRED_SHELL_FILES,
} = {}) {
  return requiredFiles.filter((relativePath) => !existsSync(resolve(rootDir, relativePath)));
}

export function assertChatbotV3BaselineShellFiles(options = {}) {
  const rootDir = options.rootDir ?? DEFAULT_ROOT_DIR;
  const requiredFiles = options.requiredFiles ?? REQUIRED_SHELL_FILES;
  const missingFiles = getMissingChatbotV3BaselineShellFiles({
    rootDir,
    requiredFiles,
  });

  if (missingFiles.length > 0) {
    throw new Error(
      [
        'Chatbot V3 baseline shell guard failed.',
        'Missing required files:',
        ...missingFiles.map((relativePath) => `- ${relativePath}`),
        `Checked from repo root: ${rootDir}`,
        'This execution branch must keep the pinned v3 shell files present before supervisor-led work can run in CI.',
      ].join('\n'),
    );
  }

  return {
    rootDir,
    checkedFiles: requiredFiles,
  };
}

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectRun) {
  try {
    const result = assertChatbotV3BaselineShellFiles();
    console.log(
      [
        'Chatbot V3 baseline shell guard passed.',
        `Checked ${result.checkedFiles.length} required files from ${result.rootDir}.`,
      ].join('\n'),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
