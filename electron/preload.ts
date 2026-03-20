// Preload script for secure IPC between renderer and main process.
// Currently minimal — contextBridge APIs can be added here as needed.
//
// Since the renderer loads localhost (our own Express server), and
// contextIsolation is enabled, no node APIs are exposed to the page.
