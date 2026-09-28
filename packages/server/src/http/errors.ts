/**
 * Errors the application raises on purpose, each mapping to one HTTP status. Anything
 * else reaching the error handler is a bug, and is reported as a 500 without leaking its
 * message to the client.
 */
export class ApplicationError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends ApplicationError {
  constructor(what: string) {
    super(`${what} was not found.`, 404, 'not_found');
  }
}

export class ValidationError extends ApplicationError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'validation_failed', details);
  }
}

export class ConflictError extends ApplicationError {
  constructor(message: string) {
    super(message, 409, 'conflict');
  }
}
