import { initKnex, getDb } from '../src/db/connection.js';

async function main() {
  initKnex();
  const db = getDb();
  const [batch, log] = await db.migrate.latest();
  console.log(`Ran ${log.length} migration(s) (batch ${batch}) on ${db.client.config.client}`);
  await db.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
