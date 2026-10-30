import { Module } from '@nestjs/common';
import { DbModule } from '../db.module.js';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';

@Module({
  imports: [DbModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
