import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PageService } from './page/page.service';
import { PageModule } from './page/page.module';

@Module({
  imports: [PageModule],
  controllers: [AppController],
  providers: [AppService, PageService],
})
export class AppModule {}
