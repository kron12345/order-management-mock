import { Body, Controller, Delete, Get, Param, Put, Query } from '@nestjs/common';
import { MockStore, TemplateSetDto, TimelineActivityDto, TimelineResponseDto } from './mock.store';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly store: MockStore) {}

  @Get()
  listTemplates(): TemplateSetDto[] {
    return this.store.listTemplates();
  }

  @Get(':id')
  getTemplate(@Param('id') id: string): TemplateSetDto {
    return this.store.getTemplate(id) ?? this.store.ensureTemplate(id);
  }

  @Put(':id')
  updateTemplate(@Param('id') id: string, @Body() body: TemplateSetDto): TemplateSetDto {
    return this.store.upsertTemplate({ ...body, id });
  }

  @Get(':id/timeline')
  loadTemplateTimeline(
    @Param('id') id: string,
    @Query('lod') lod: 'activity' | 'service' = 'activity',
  ): TimelineResponseDto {
    const tpl = this.store.getTemplate(id) ?? this.store.ensureTemplate(id);
    if (lod === 'service') {
      return { lod: 'service', services: [] };
    }
    return { lod: 'activity', activities: this.store.templateActivities(tpl.id) };
  }

  @Put(':id/activities/:activityId')
  upsertActivity(
    @Param('id') id: string,
    @Param('activityId') activityId: string,
    @Body() body: TimelineActivityDto,
  ): TimelineActivityDto {
    return this.store.upsertTemplateActivity(id, { ...body, id: activityId });
  }

  @Delete(':id/activities/:activityId')
  deleteActivity(@Param('id') id: string, @Param('activityId') activityId: string): void {
    this.store.deleteTemplateActivity(id, activityId);
  }
}
