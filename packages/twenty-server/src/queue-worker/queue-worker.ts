import { NestFactory } from '@nestjs/core';
import { createServer } from 'node:http';

import { ExceptionHandlerService } from 'src/engine/core-modules/exception-handler/exception-handler.service';
import { LoggerService } from 'src/engine/core-modules/logger/logger.service';
import { shouldCaptureException } from 'src/engine/utils/global-exception-handler.util';
import 'src/instrument';
import { QueueWorkerModule } from 'src/queue-worker/queue-worker.module';
import { enableValidationMetadataCache } from 'src/utils/enable-validation-metadata-cache.util';

async function bootstrap() {
  let exceptionHandlerService: ExceptionHandlerService | undefined;
  let loggerService: LoggerService | undefined;

  enableValidationMetadataCache();

  try {
    const app = await NestFactory.createApplicationContext(QueueWorkerModule, {
      bufferLogs: process.env.LOGGER_IS_BUFFER_ENABLED === 'true',
    });

    loggerService = app.get(LoggerService);
    exceptionHandlerService = app.get(ExceptionHandlerService);

    app.useLogger(loggerService ?? false);

    app.enableShutdownHooks();

    // Cranl requires an HTTP health endpoint on each running service.
    if (process.env.TWENTY_SERVICE === 'worker') {
      const healthServer = createServer((request, response) => {
        response.writeHead(request.url === '/healthz' ? 200 : 404);
        response.end();
      });
      healthServer.listen(Number(process.env.NODE_PORT || 3000), '0.0.0.0');
    }
  } catch (err) {
    loggerService?.error(err?.message, err?.name);

    if (shouldCaptureException(err)) {
      exceptionHandlerService?.captureExceptions([err]);
    }

    throw err;
  }
}
void bootstrap();
