import { ArgumentsHost, Catch } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';

// Default Nest behaviour is to emit `exception` for WsException, but the
// rest of this gateway emits app-level errors via `client.emit('error', ...)`.
// Unify on a single channel so the FE only has to listen to one event.
@Catch(WsException)
export class WsErrorFilter extends BaseWsExceptionFilter {
  catch(exception: WsException, host: ArgumentsHost): void {
    const client = host.switchToWs().getClient<{
      emit: (event: string, payload: unknown) => void;
    }>();
    const err = exception.getError();
    const message =
      typeof err === 'string'
        ? err
        : (err as { message?: string })?.message ?? 'Invalid payload';
    client.emit('error', message);
  }
}
