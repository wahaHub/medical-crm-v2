import { teardownDb } from './helpers.js';

export default async function globalTeardown() {
  await teardownDb();
}
