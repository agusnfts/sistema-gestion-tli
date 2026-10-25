import { Global, Module } from '@nestjs/common';
import { IndexingService } from './indexing.service';

/** Global: documentos, integraciones y artículos reindexan al cambiar. */
@Global()
@Module({
  providers: [IndexingService],
  exports: [IndexingService],
})
export class IndexingModule {}
