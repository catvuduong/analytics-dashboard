import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { EventsService } from './events.service.js';
import { validateEvent } from './event.validation.js';

@Controller()
export class EventsController {
  constructor(private readonly events: EventsService) {}

  // Browsers send one event per request, so this accepts a single object rather than a batch.
  @Post('collect')
  @HttpCode(HttpStatus.ACCEPTED)
  async collect(@Body() body: unknown) {
    const result = validateEvent(body, new Date());
    if (!result.ok) throw new BadRequestException(result.errors);
    return this.events.record(result.event);
  }
}
