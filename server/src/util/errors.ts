export class AppError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function notFound(code: string, message: string): AppError {
  return new AppError(code, 404, message);
}

export function badRequest(code: string, message: string, details?: unknown): AppError {
  return new AppError(code, 400, message, details);
}

export function conflict(code: string, message: string): AppError {
  return new AppError(code, 409, message);
}
