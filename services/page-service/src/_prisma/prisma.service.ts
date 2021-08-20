import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
///<reference path="../node_modules/.prisma/client/index.d.ts"/>
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient
  implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
