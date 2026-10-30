import { Module } from '@nestjs/common';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DbModule } from './db.module.js';
import { EventsModule } from './events/events.module.js';
import { SeedModule } from './seed/seed.module.js';

@Module({
  imports: [DbModule, AnalyticsModule, EventsModule, SeedModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
