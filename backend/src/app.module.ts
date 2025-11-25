import { Module } from '@nestjs/common';
import { MockModule } from './mock/mock.module';

@Module({
  imports: [
    MockModule,
  ],
})
export class AppModule {}
