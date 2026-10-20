import { Global, Module } from '@nestjs/common';
import { CHANNEL_ADAPTERS } from './channel';
import { EmailAdapter } from './email.adapter';
import { MessagingService } from './messaging.service';

@Global()
@Module({
  providers: [
    EmailAdapter,
    // Add SmsAdapter / ViberAdapter here when those channels are built.
    { provide: CHANNEL_ADAPTERS, useFactory: (email: EmailAdapter) => [email], inject: [EmailAdapter] },
    MessagingService,
  ],
  exports: [MessagingService, EmailAdapter],
})
export class MessagingModule {}
