import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BoringdocModule } from './boringdoc/boringdoc.module';

@Module({
  imports: [BoringdocModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
