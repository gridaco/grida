import { Body, Controller, Get, Post } from '@nestjs/common';
import { PageService } from './page.service';

@Controller('page')
export class PageController {
  constructor(private readonly service: PageService) {}
  @Get('/')
  getPages() {
    return [];
  }

  @Post('/')
  createPage(@Body() body: CreatePageRequestDTO) {
    //
    const workspace = ''; // TODO: get this from auth pipe.
    return this.service.createPage({ ...body, workspace });
  }
}

interface CreatePageRequestDTO {
  name: string;
  parent: string | 'page-root';
  type: 'boring' | 'nothing';
  initialContent: any;
}
