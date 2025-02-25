import { Injectable } from '@nestjs/common';
import { PrismaService } from '../_prisma/prisma.service';

@Injectable()
export class DocumentService {
  constructor(private readonly prisma: PrismaService) {}

  async registerDocument(p: {
    provider: string;
    content: string;
  }): Promise<DocumentFirstPartyRegistrationResult> {
    //
    // TODO: call first party api
    return {
      documentId: 'boring01',
      provider: 'FIRSTPARTY_BORING',
    };
  }
}

interface DocumentFirstPartyRegistrationResult {
  documentId: string;
  provider: string;
}
