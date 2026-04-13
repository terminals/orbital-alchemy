import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  ORBITAL_HOME,
  detectProjectRoot,
  loadRegistry,
  writeRegistryAtomic,
} from '../lib/helpers.js';

export function cmdRegister(args) {
  const targetPath = args[0] ? path.resolve(args[0]) : detectProjectRoot();
  const nameFlag = args.indexOf('--alias');
  const name = nameFlag >= 0 ? args[nameFlag + 1] : path.basename(targetPath);

  if (!fs.existsSync(ORBITAL_HOME)) fs.mkdirSync(ORBITAL_HOME, { recursive: true });

  if (!fs.existsSync(path.join(targetPath, '.claude'))) {
    console.error(`Error: ${targetPath} has not been initialized with Orbital Command.`);
    console.error(`Run \`orbital\` in that directory first.`);
    process.exit(1);
  }

  const registry = loadRegistry();

  if (registry.projects?.some(p => p.path === targetPath)) {
    console.log(`Project already registered: ${targetPath}`);
    return;
  }

  const COLORS = [
    '210 80% 55%', '340 75% 55%', '160 60% 45%', '30 90% 55%',
    '270 65% 55%', '50 85% 50%', '180 55% 45%', '0 70% 55%',
    '120 50% 42%', '300 60% 50%', '200 70% 50%', '15 80% 55%',
  ];
  const usedColors = (registry.projects || []).map(p => p.color);
  const color = COLORS.find(c => !usedColors.includes(c)) || COLORS[0];

  const baseSlug = path.basename(targetPath).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'project';
  const existingIds = (registry.projects || []).map(p => p.id);
  const slug = existingIds.includes(baseSlug)
    ? `${baseSlug}-${crypto.createHash('sha256').update(targetPath).digest('hex').slice(0, 4)}`
    : baseSlug;

  const project = {
    id: slug,
    path: targetPath,
    name,
    color,
    registeredAt: new Date().toISOString(),
    enabled: true,
  };

  if (!registry.projects) registry.projects = [];
  registry.projects.push(project);
  writeRegistryAtomic(registry);

  console.log(`Registered project: ${name}`);
  console.log(`  ID:    ${slug}`);
  console.log(`  Path:  ${targetPath}`);
  console.log(`  Color: ${color}`);
}

export function cmdUnregister(args) {
  const idOrPath = args[0];
  if (!idOrPath) {
    console.error('Usage: orbital unregister <id-or-path>');
    process.exit(1);
  }

  const absPath = path.isAbsolute(idOrPath) ? idOrPath : path.resolve(idOrPath);
  const registry = loadRegistry();
  const idx = (registry.projects || []).findIndex(p => p.id === idOrPath || p.path === absPath);

  if (idx === -1) {
    console.error(`Project not found: ${idOrPath}`);
    process.exit(1);
  }

  const removed = registry.projects.splice(idx, 1)[0];
  writeRegistryAtomic(registry);

  console.log(`Unregistered project: ${removed.name} (${removed.id})`);
  console.log(`  Project files in ${removed.path} are preserved.`);
}

export function cmdProjects() {
  const registry = loadRegistry();
  const projects = registry.projects || [];

  if (projects.length === 0) {
    console.log('\nNo projects registered.');
    console.log('Run `orbital` in a project directory to get started.\n');
    return;
  }

  console.log(`\n  ${'ID'.padEnd(22)} ${'NAME'.padEnd(22)} ${'STATUS'.padEnd(10)} PATH`);
  console.log(`  ${'─'.repeat(22)} ${'─'.repeat(22)} ${'─'.repeat(10)} ${'─'.repeat(30)}`);
  for (const p of projects) {
    const status = p.enabled ? (fs.existsSync(p.path) ? 'active' : 'offline') : 'disabled';
    console.log(`  ${p.id.padEnd(22)} ${p.name.padEnd(22)} ${status.padEnd(10)} ${p.path}`);
  }
  console.log();
}
