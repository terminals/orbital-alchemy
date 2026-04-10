/**
 * Phase 2 welcome gate — project-scoped only.
 *
 * If the project is already initialized, offers re-init or config editor.
 * If not, returns false to continue the project setup flow.
 */

import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { ProjectSetupState } from '../types.js';
import { NOTES } from '../ui.js';
import { runConfigEditor } from '../config-editor.js';

export async function phaseWelcome(state: ProjectSetupState): Promise<boolean> {
  if (state.isProjectInitialized) {
    p.note(NOTES.reconfigure, pc.yellow('Already Initialized'));

    const action = await p.select({
      message: 'What would you like to do?',
      options: [
        { value: 'configure', label: 'Open config editor', hint: 'modify settings' },
        { value: 'cancel', label: 'Cancel' },
      ],
    });

    if (p.isCancel(action) || action === 'cancel') {
      p.cancel('Cancelled.');
      process.exit(0);
    }

    if (action === 'configure') {
      await runConfigEditor(state.projectRoot, state.packageVersion, []);
      process.exit(0);
    }
  }

  // Not initialized — continue normally
  return false;
}
