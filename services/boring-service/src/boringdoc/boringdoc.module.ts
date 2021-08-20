import { Module } from '@nestjs/common';
import { BoringdocController } from './boringdoc.controller';
import { BoringdocService } from './boringdoc.service';

@Module({
  controllers: [BoringdocController],
  providers: [BoringdocService],
})
export class BoringdocModule {}
