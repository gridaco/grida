import { Injectable } from '@nestjs/common';
import { DocumentService } from '../document/document.service';
import { PrismaService } from '../_prisma/prisma.service';
import { MoveSortItemDiffResult } from 'treearray';

@Injectable()
export class PageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly docservice: DocumentService,
  ) {}

  async listPages(p: { workspace: string }) {
    //
    return await this.prisma.page.findMany({
      where: {
        workspace: p.workspace,
      },
      select: {
        id: true,
        name: true,
        type: true,
        workspace: true,
        document: true,
        parentId: true,
        children: false, // do not include children
      },
    });
  }

  async createPage(p: {
    name: string;
    parent: string | 'page-root';
    type: 'boring' | 'nothing';
    workspace: string;
    initialContent: string;
  }) {
    const _isonroot = p.parent === 'page-root';
    const parentid = _isonroot ? undefined : p.parent;
    const provider = 'FIRSTPARTY_BORING';

    // create document
    // register document first via foreign service
    const _documentRegistrationResult = await this.docservice.registerDocument({
      provider: provider,
      content: p.initialContent,
    });

    await this.prisma.page.create({
      data: {
        type: p.type,
        name: p.name,
        workspace: p.workspace,
        parent: {
          connect: {
            id: parentid,
          },
        },
        sort: undefined, // we don't need to provide sort information. this is autoencremented. adding new page under dedicated parent will always ne placed on the last place of the parent.
        meta: null,
        document: {
          create: {
            documentId: _documentRegistrationResult.documentId,
            provider: provider,
          },
        },
      },
    });
  }

  async movePage(p: {
    /**
     * id of target page to be moved
     */
    id: string;
    workspace: string;
    originOrder: number;
    originParent: string;
    targetParent: string;
    targetOrder: number;
  }): Promise<MoveSortItemDiffResult> {
    // list all pages under parent.
    // alias (parent's children) previously before target (this page) is being moved.
    const prev_alias = await this.prisma.page.findMany({
      select: {
        id: true,
        sort: true,
      },
      where: {
        parentId: p.targetParent,
        workspace: p.workspace, // this field is required since root pages' parent are shared.
      },
    });

    prev_alias.forEach((p) => {
      //
    });

    // update target selected page
    const moved = await this.prisma.page.update({
      where: {
        id: p.id,
      },
      data: {
        parent: {
          connect: {
            id: p.targetParent,
          },
        },
        sort: 0,
      },
    });
    return <MoveSortItemDiffResult>{
      parent: p.targetParent,
      updates: [
        /* add here */
      ],
      moved: {
        ...moved,
        ...p,
      },
    };
  }
}
