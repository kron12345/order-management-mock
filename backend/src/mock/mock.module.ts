import { Module } from '@nestjs/common';
import { MockStore } from './mock.store';
import { ResourcesController } from './resources.controller';
import { TemplatesController } from './templates.controller';
import { TimelineCompatController } from './timeline-compat.controller';

@Module({
  providers: [MockStore],
  controllers: [ResourcesController, TemplatesController, TimelineCompatController],
})
export class MockModule {}
