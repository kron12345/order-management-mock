import { Controller, Get, Query } from '@nestjs/common';
import { MockStore, PlanningStageId, TimelineResponseDto } from './mock.store';

@Controller('timeline')
export class TimelineCompatController {
  constructor(private readonly store: MockStore) {}

  @Get()
  getTimeline(
    @Query('stage') stage: PlanningStageId = 'operations',
    @Query('lod') lod: 'activity' | 'service' = 'activity',
  ): TimelineResponseDto {
    if (lod === 'service') {
      return { lod: 'service', services: [] };
    }
    return this.store.timeline(stage);
  }
}
