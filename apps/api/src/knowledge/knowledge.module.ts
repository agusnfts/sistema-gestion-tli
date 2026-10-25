import { Module } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { KnowledgeController } from './knowledge.controller';
import { LibraryService } from './library.service';
import { SearchService } from './search.service';

@Module({
  controllers: [KnowledgeController],
  providers: [ArticlesService, LibraryService, SearchService],
})
export class KnowledgeModule {}
