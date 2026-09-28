import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ApplicationError } from './errors';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'not_found', message: `No route matches ${req.method} ${req.path}.` },
  });
};

/**
 * The single place an error becomes a response.
 *
 * Deliberate application errors carry their own status and a message meant for the user.
 * Anything else is a bug: it is logged in full and reported as a bare 500, because an
 * unexpected exception's message is as likely to contain a SQL fragment as anything
 * useful to the person reading it.
 */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ApplicationError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
    });
    return;
  }

  console.error('Unhandled error:', error);
  res.status(500).json({
    error: { code: 'internal_error', message: 'Something went wrong handling this request.' },
  });
};
