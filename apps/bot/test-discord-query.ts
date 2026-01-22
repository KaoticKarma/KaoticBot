import { db, schema } from './src/db/index.js';

try {
  const results = db.select().from(schema.discordSettings).all();
  console.log('Success! Results:', results);
} catch (e) {
  console.log('Error details:', e);
}
