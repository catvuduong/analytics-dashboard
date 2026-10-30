import { Module } from '@nestjs/common';
import { DbService } from './db.service.js';

// One shared DbService (and therefore one connection pool) for every feature module.
@Module({
  providers: [DbService],
  exports: [DbService],
})
export class DbModule {}
