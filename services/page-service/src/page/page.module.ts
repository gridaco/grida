import { Module } from '@nestjs/common';
import { PageController } from './page.controller';

@Module({
  controllers: [PageController]
})
export class PageModule {}
