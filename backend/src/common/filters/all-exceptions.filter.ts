import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = isHttp ? exception.getResponse() : { message: 'Internal server error' };

    if (!isHttp) {
      this.logger.error(`${req.method} ${req.url} — ${(exception as Error)?.stack || exception}`);
    }

    res.status(status).json(
      typeof body === 'string'
        ? { statusCode: status, message: body }
        : { statusCode: status, ...(body as Record<string, unknown>) },
    );
  }
}
