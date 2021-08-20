import { Injectable } from '@nestjs/common';
import { PrismaService } from '../_prisma/prisma.service';

@Injectable()
export class BoringdocService {
  constructor(private readonly prisma: PrismaService) {}
  async findAll(p: { workspace: string }): Promise<any> {
    //
  }

  async get(id: string) {
    return await this.prisma.document.findUnique({
      where: {
        id: id,
      },
    });
  }

  async create(p: { title: string; content: string }) {
    return await this.prisma.document.create({
      data: {
        title: p.title,
        content: p.content,
      },
    });
  }
}
