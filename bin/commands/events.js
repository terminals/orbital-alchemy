import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { detectProjectRoot } from '../lib/helpers.js';

export function cmdEmit(args) {
  const type = args[0];
  const jsonStr = args.slice(1).join(' ');

  if (!type) {
    console.error('Usage: orbital emit <TYPE> <JSON>');
    process.exit(1);
  }

  const projectRoot = detectProjectRoot();
  const eventsDir = path.join(projectRoot, '.claude', 'orbital-events');
  if (!fs.existsSync(eventsDir)) fs.mkdirSync(eventsDir, { recursive: true });

  let payload;
  try {
    payload = jsonStr ? JSON.parse(jsonStr) : {};
  } catch (err) {
    console.error(`Invalid JSON: ${err.message}`);
    process.exit(1);
  }

  const eventId = crypto.randomUUID();
  const event = {
    ...payload,
    id: eventId,
    type,
    timestamp: new Date().toISOString(),
  };

  const filePath = path.join(eventsDir, `${eventId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(event, null, 2) + '\n', 'utf8');

  console.log(`Event emitted: ${type} (${eventId})`);
  console.log(`  File: ${path.relative(projectRoot, filePath)}`);
}
