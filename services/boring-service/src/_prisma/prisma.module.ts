import { Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Module({
  imports: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {
  constructor() {}
}
