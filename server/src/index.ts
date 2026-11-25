import { buildApp } from './app.js';
import { initKnex, runMigrations } from './db/connection.js';
import { config } from './config.js';

async function main() {
  initKnex();
  await runMigrations();

  const serveWeb = process.env.AIMOCK_SERVE_WEB !== 'false';
  const app = await buildApp({ serveWeb });
  await app.listen({ port: config.port, host: config.host });
  console.log(`ai-mock server listening on http://${config.host}:${config.port}`);
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
