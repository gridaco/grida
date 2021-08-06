import { Module } from '@nestjs/common';
import { PageController } from './page.controller';
import { PageService } from './page.service';

@Module({
  controllers: [PageController],
  providers: [PageService],
})
export class PageModule {}
