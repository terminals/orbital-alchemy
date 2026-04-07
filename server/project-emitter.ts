import type { Server } from 'socket.io';

/**
 * A project-scoped Socket.io emitter.
 *
 * Services use this instead of the raw Socket.io Server so that events
 * are automatically scoped to the correct project room. Events are emitted
 * to both the project-specific room (`project:{id}`) and the aggregate
 * room (`all-projects`) so that the All Projects dashboard view receives
 * updates from every project.
 *
 * The emit() signature matches Socket.io's Server.emit() so existing
 * service code requires only a type change (Server → ProjectEmitter).
 */
export class ProjectEmitter {
  constructor(
    private io: Server,
    private projectId: string,
  ) {}

  /** Emit an event to this project's room and the all-projects room. */
  emit(event: string, ...args: unknown[]): boolean {
    // Inject project ID into the first data argument if it's an object
    const enrichedArgs = args.map((arg, i) => {
      if (i === 0 && arg !== null && typeof arg === 'object' && !Array.isArray(arg)) {
        return { ...(arg as Record<string, unknown>), _projectId: this.projectId };
      }
      return arg;
    });

    this.io.to(`project:${this.projectId}`).emit(event, ...enrichedArgs);
    this.io.to('all-projects').emit(event, ...enrichedArgs);
    return true;
  }

  /** Get the underlying Socket.io server (for operations that need it, e.g., connection handling). */
  getServer(): Server {
    return this.io;
  }

  /** Get the project ID this emitter is scoped to. */
  getProjectId(): string {
    return this.projectId;
  }
}

/**
 * Type alias used by services and routes that accept either a raw Server
 * (backward compat / single-project mode) or a ProjectEmitter.
 *
 * Both have an emit(event, ...args) method, so services work with either.
 */
export type Emitter = ProjectEmitter | Server;
