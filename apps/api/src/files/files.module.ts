import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { LocalStorage, STORAGE } from './storage';
import { ANTIVIRUS, ClamdScanner, EicarScanner } from './antivirus';

@Global()
@Module({
  controllers: [FilesController],
  providers: [
    FilesService,
    {
      provide: STORAGE,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) => new LocalStorage(c.storage.dir),
    },
    {
      provide: ANTIVIRUS,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) =>
        c.antivirus.driver === 'eicar'
          ? new EicarScanner()
          : new ClamdScanner(c.antivirus.host, c.antivirus.port),
    },
  ],
  exports: [FilesService],
})
export class FilesModule {}
