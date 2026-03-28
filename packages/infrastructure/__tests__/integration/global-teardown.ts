import { teardownDb } from './helpers.js';

export default async function globalSetup() {
  return async () => {
    await teardownDb();
  };
}
