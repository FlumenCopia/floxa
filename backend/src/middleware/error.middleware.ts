import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export interface AppError extends Error {
  statusCode?: number;
  status?: number;
  code?: string;
}

export function errorHandler(err: AppError | ZodError, req: Request, res: Response, next: NextFunction) {
  // Handle Zod validation errors to match DRF field error dictionary format
  if (err instanceof ZodError) {
    const formattedErrors: Record<string, string[]> = {};
    err.errors.forEach((issue) => {
      const field = issue.path.join('_') || 'non_field_errors';
      if (!formattedErrors[field]) {
        formattedErrors[field] = [];
      }
      formattedErrors[field].push(issue.message);
    });
    res.status(400).json(formattedErrors);
    return;
  }

  // Handle Multer upload errors
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ detail: 'File too large.' });
      return;
    }
    res.status(400).json({ detail: err.message || 'File upload error.' });
    return;
  }

  // Handle Mongoose CastError (e.g. invalid ObjectId) safely as 404
  if (err.name === 'CastError') {
    res.status(404).json({ detail: 'Resource not found.' });
    return;
  }

  const statusCode = err.statusCode || err.status || 500;
  const message = statusCode >= 500 ? 'An unexpected server error occurred.' : (err.message || 'An error occurred.');

  res.status(statusCode).json({
    detail: message,
  });
}
