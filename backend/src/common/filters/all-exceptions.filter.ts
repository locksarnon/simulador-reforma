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
    // Erros de leitura do corpo (body-parser/http-errors) trazem o status 4xx correto — antes viravam 500.
    const e = exception as { status?: number; statusCode?: number; message?: string };
    const clientStatus = !isHttp ? Number(e?.status ?? e?.statusCode) : NaN;
    const isClientErr = !isHttp && clientStatus >= 400 && clientStatus < 500;
    const status = isHttp ? exception.getStatus() : isClientErr ? clientStatus : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = isHttp
      ? exception.getResponse()
      : isClientErr
        ? { message: clientStatus === 413 ? 'Conteúdo grande demais para enviar de uma vez.' : e?.message || 'Requisição inválida.' }
        : { message: 'Internal server error' };

    if (!isHttp && !isClientErr) {
      this.logger.error(`${req.method} ${req.url} — ${(exception as Error)?.stack || exception}`);
    }

    res.status(status).json(
      typeof body === 'string'
        ? { statusCode: status, message: body }
        : { statusCode: status, ...(body as Record<string, unknown>) },
    );
  }
}
