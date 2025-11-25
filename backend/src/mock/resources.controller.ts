import { Body, Controller, Get, Put } from '@nestjs/common';
import { MockStore, ResourceSnapshotDto } from './mock.store';

@Controller('planning/resources')
export class ResourcesController {
  constructor(private readonly store: MockStore) {}

  @Get()
  getSnapshot(): ResourceSnapshotDto {
    return this.store.getSnapshot();
  }

  @Put()
  replaceSnapshot(@Body() snapshot: ResourceSnapshotDto): ResourceSnapshotDto {
    return this.store.setSnapshot(snapshot);
  }
}
