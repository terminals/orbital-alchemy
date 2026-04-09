/**
 * REST API routes for the manifest-based primitive management system.
 * Exposes status, validation, update, pin/unpin, reset, and diff operations.
 */

import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import { Router } from 'express';
import {
  loadManifest,
  saveManifest,
  hashFile,
  computeFileStatus,
  refreshFileStatuses,
  summarizeManifest,
  reverseRemapPath,
  safeBackupFile,
  safeCopyTemplate,
  safeRestoreFile,
} from '../manifest.js';
import { validate } from '../validator.js';
import { computeUpdatePlan, loadRenameMap } from '../update-planner.js';
import { runInit, runUpdate } from '../init.js';
import { needsLegacyMigration, migrateFromLegacy } from '../migrate-legacy.js';
import type { Emitter } from '../project-emitter.js';
import { errMsg, isValidRelativePath } from '../utils/route-helpers.js';

// ─── Types ──────────────────────────────────────────────────

interface ManifestRouteDeps {
  projectRoot: string;
  templatesDir: string;
  packageVersion: string;
  io: Emitter;
}


// ─── Route Factory ──────────────────────────────────────────

export function createManifestRoutes({
  projectRoot,
  templatesDir,
  packageVersion,
  io,
}: ManifestRouteDeps): Router {
  const router = Router();
  const claudeDir = path.join(projectRoot, '.claude');

  // ─── GET /manifest/status — summary overview ────────────

  router.get('/manifest/status', (_req, res) => {
    try {
      const manifest = loadManifest(projectRoot);

      if (!manifest) {
        return res.json({
          success: true,
          data: {
            exists: false,
            packageVersion,
            installedVersion: '',
            needsUpdate: true,
            preset: '',
            files: { total: 0, synced: 0, modified: 0, pinned: 0, userOwned: 0, byType: {} },
            lastUpdated: '',
          },
        });
      }

      refreshFileStatuses(manifest, claudeDir);
      const summary = summarizeManifest(manifest);

      res.json({
        success: true,
        data: {
          exists: true,
          packageVersion,
          installedVersion: manifest.packageVersion,
          needsUpdate: manifest.packageVersion !== packageVersion,
          preset: manifest.preset,
          files: summary,
          lastUpdated: manifest.updatedAt,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: errMsg(err) });
    }
  });

  // ─── GET /manifest/files — file inventory ───────────────

  router.get('/manifest/files', (_req, res) => {
    try {
      const manifest = loadManifest(projectRoot);
      if (!manifest) {
        return res.json({ success: true, data: [] });
      }

      refreshFileStatuses(manifest, claudeDir);

      const files = Object.entries(manifest.files).map(([filePath, record]) => ({
        path: filePath,
        origin: record.origin,
        status: record.status,
        templateHash: record.templateHash,
        installedHash: record.installedHash,
        pinnedAt: record.pinnedAt,
        pinnedReason: record.pinnedReason,
        hasPrev: fs.existsSync(path.join(claudeDir, filePath + '.prev')),
      }));

      res.json({ success: true, data: files });
    } catch (err) {
      res.status(500).json({ success: false, error: errMsg(err) });
    }
  });

  // ─── GET /manifest/validate — run validation ────────────

  router.get('/manifest/validate', (_req, res) => {
    try {
      const report = validate(projectRoot, packageVersion);
      res.json({ success: true, data: report });
    } catch (err) {
      res.status(500).json({ success: false, error: errMsg(err) });
    }
  });

  // ─── POST /manifest/init — initialize manifest ───────────

  router.post('/manifest/init', (_req, res) => {
    try {
      // If manifest already exists, just return success
      if (loadManifest(projectRoot)) {
        return res.json({ success: true, message: 'Already initialized' });
      }

      // If legacy install exists, migrate it
      if (needsLegacyMigration(projectRoot)) {
        migrateFromLegacy(projectRoot, templatesDir, packageVersion);
        io.emit('manifest:changed', { action: 'initialized' });
        return res.json({ success: true });
      }

      // No existing install at all — run full init
      runInit(projectRoot, { force: false });
      io.emit('manifest:changed', { action: 'initialized' });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: errMsg(err) });
    }
  });

  // ─── POST /manifest/update — run update or dry-run ──────

  router.post('/manifest/update', (req, res) => {
    const { dryRun = true } = req.body as { dryRun?: boolean };

    try {
      // Ensure manifest exists (migrate legacy if needed)
      let manifest = loadManifest(projectRoot);
      if (!manifest && needsLegacyMigration(projectRoot)) {
        migrateFromLegacy(projectRoot, templatesDir, packageVersion);
        manifest = loadManifest(projectRoot);
      }

      if (!manifest) {
        return res.status(400).json({ success: false, error: 'No manifest. Run orbital init first.' });
      }

      if (dryRun) {
        refreshFileStatuses(manifest, claudeDir);
        const renameMap = loadRenameMap(templatesDir, manifest.packageVersion, packageVersion);
        const plan = computeUpdatePlan({
          templatesDir,
          claudeDir,
          manifest,
          newVersion: packageVersion,
          renameMap,
        });
        return res.json({ success: true, data: plan });
      }

      // Execute actual update
      runUpdate(projectRoot, { dryRun: false });
      io.emit('manifest:changed', { action: 'updated' });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: errMsg(err) });
    }
  });

  // ─── POST /manifest/pin — pin a file ───────────────────

  router.post('/manifest/pin', (req, res) => {
    const { file, reason } = req.body as { file: string; reason?: string };
    if (!file || !isValidRelativePath(file)) {
      return res.status(400).json({ success: false, error: 'Valid file path required' });
    }

    try {
      const manifest = loadManifest(projectRoot);
      if (!manifest) return res.status(400).json({ success: false, error: 'No manifest' });

      const record = manifest.files[file];
      if (!record) return res.status(404).json({ success: false, error: 'File not tracked' });
      if (record.origin === 'user') return res.status(400).json({ success: false, error: 'Cannot pin user-owned file' });

      record.status = 'pinned';
      record.pinnedAt = new Date().toISOString();
      if (reason) record.pinnedReason = reason;

      saveManifest(projectRoot, manifest);
      io.emit('manifest:changed', { action: 'pinned', file });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: errMsg(err) });
    }
  });

  // ─── POST /manifest/unpin — unpin a file ────────────────

  router.post('/manifest/unpin', (req, res) => {
    const { file } = req.body as { file: string };
    if (!file || !isValidRelativePath(file)) {
      return res.status(400).json({ success: false, error: 'Valid file path required' });
    }

    try {
      const manifest = loadManifest(projectRoot);
      if (!manifest) return res.status(400).json({ success: false, error: 'No manifest' });

      const record = manifest.files[file];
      if (!record || record.status !== 'pinned') {
        return res.status(400).json({ success: false, error: 'File is not pinned' });
      }

      // Clear pinned state before recomputing status
      record.status = 'synced';
      delete record.pinnedAt;
      delete record.pinnedReason;

      const absPath = path.join(claudeDir, file);
      if (fs.existsSync(absPath)) {
        const currentHash = hashFile(absPath);
        record.status = computeFileStatus(record, currentHash);
      }

      saveManifest(projectRoot, manifest);
      io.emit('manifest:changed', { action: 'unpinned', file });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: errMsg(err) });
    }
  });

  // ─── POST /manifest/reset — reset file to template ──────

  router.post('/manifest/reset', (req, res) => {
    const { file } = req.body as { file: string };
    if (!file || !isValidRelativePath(file)) {
      return res.status(400).json({ success: false, error: 'Valid file path required' });
    }

    try {
      const manifest = loadManifest(projectRoot);
      if (!manifest) return res.status(400).json({ success: false, error: 'No manifest' });

      const record = manifest.files[file];
      if (!record || record.origin !== 'template') {
        return res.status(400).json({ success: false, error: 'Not a template file' });
      }

      // Resolve template source path
      const templateRelPath = reverseRemapPath(file);
      const templatePath = path.join(templatesDir, templateRelPath);
      if (!fs.existsSync(templatePath)) {
        return res.status(404).json({ success: false, error: 'Template file not found' });
      }

      const localPath = path.join(claudeDir, file);

      // Back up current version so user can revert (symlink-safe)
      safeBackupFile(localPath);

      // Copy template to destination (skips if symlink)
      safeCopyTemplate(templatePath, localPath);

      const newHash = hashFile(localPath);
      record.status = 'synced';
      record.templateHash = newHash;
      record.installedHash = newHash;
      delete record.pinnedAt;
      delete record.pinnedReason;

      saveManifest(projectRoot, manifest);
      io.emit('manifest:changed', { action: 'reset', file });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: errMsg(err) });
    }
  });

  // ─── POST /manifest/revert — restore file from .prev backup ──

  router.post('/manifest/revert', (req, res) => {
    const { file } = req.body as { file: string };
    if (!file || !isValidRelativePath(file)) {
      return res.status(400).json({ success: false, error: 'Valid file path required' });
    }

    try {
      const manifest = loadManifest(projectRoot);
      if (!manifest) return res.status(400).json({ success: false, error: 'No manifest' });

      const record = manifest.files[file];
      if (!record) return res.status(404).json({ success: false, error: 'File not tracked' });

      const localPath = path.join(claudeDir, file);

      if (!safeRestoreFile(localPath)) {
        return res.status(404).json({ success: false, error: 'No previous version available' });
      }

      // Recompute status — file may now be a symlink or regular file
      if (fs.existsSync(localPath)) {
        const stat = fs.lstatSync(localPath);
        if (stat.isSymbolicLink()) {
          record.status = 'synced'; // restored symlink points at template
        } else {
          const currentHash = hashFile(localPath);
          record.installedHash = currentHash;
          record.status = computeFileStatus(record, currentHash);
        }
      } else {
        record.status = 'missing';
      }

      saveManifest(projectRoot, manifest);
      io.emit('manifest:changed', { action: 'reverted', file });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: errMsg(err) });
    }
  });

  // ─── GET /manifest/diff — diff template vs local ─────────

  router.get('/manifest/diff', (req, res) => {
    const file = req.query.file as string;
    if (!file || !isValidRelativePath(file)) {
      return res.status(400).json({ success: false, error: 'Valid file path required' });
    }

    try {
      const templateRelPath = reverseRemapPath(file);
      const rawTemplatePath = path.join(templatesDir, templateRelPath);
      // Resolve symlinks so git diff compares file content, not symlink metadata
      const templatePath = fs.existsSync(rawTemplatePath) ? fs.realpathSync(rawTemplatePath) : rawTemplatePath;
      const localPath = path.join(claudeDir, file);

      if (!fs.existsSync(templatePath)) {
        return res.status(404).json({ success: false, error: 'Template file not found' });
      }
      if (!fs.existsSync(localPath)) {
        return res.status(404).json({ success: false, error: 'Local file not found' });
      }

      let diff = '';
      try {
        diff = execFileSync('git', ['diff', '--no-index', '--', templatePath, localPath], {
          encoding: 'utf-8',
        });
      } catch (e: unknown) {
        // git diff exits 1 when files differ
        const err = e as { stdout?: string };
        diff = err.stdout || 'Files differ';
      }

      res.json({ success: true, data: { diff } });
    } catch (err) {
      res.status(500).json({ success: false, error: errMsg(err) });
    }
  });

  return router;
}
