import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
export const CLINIC = Symbol('CLINIC');
export const sessionToken = (req: Request) =>
  (req.headers.cookie || '')
    .split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith('vet_session='))
    ?.slice('vet_session='.length);
@Catch()
export class ApiErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof z.ZodError) {
      response.status(400).json({
        message: error.issues.map((i) => `${i.path.join('.') || 'Input'}: ${i.message}`).join('; '),
      });
      return;
    }
    if (error instanceof HttpException) {
      response.status(error.getStatus()).json({ message: error.message });
      return;
    }
    if (
      error &&
      typeof error === 'object' &&
      'status' in error &&
      (error.status === 400 || error.status === 413)
    ) {
      response
        .status(error.status)
        .json({ message: error.status === 413 ? 'Request is too large' : 'Invalid JSON request' });
      return;
    }
    console.error('Unhandled API error', error instanceof Error ? error.message : 'unknown');
    response.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
}
