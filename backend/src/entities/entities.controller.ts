import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { EntitiesService } from './entities.service';

@Controller('entities/:model')
export class EntitiesController {
  constructor(private readonly entities: EntitiesService) {}

  @Get()
  list(@Param('model') model: string) {
    return this.entities.list(model);
  }

  @Post('query')
  query(
    @Param('model') model: string,
    @Body() body: { filter?: Record<string, unknown>; sort?: string; limit?: number },
  ) {
    return this.entities.query(model, body);
  }

  @Get(':id')
  get(@Param('model') model: string, @Param('id') id: string) {
    return this.entities.get(model, id);
  }

  @Post()
  create(@Param('model') model: string, @Body() data: Record<string, unknown>) {
    return this.entities.create(model, data);
  }

  @Put(':id')
  update(@Param('model') model: string, @Param('id') id: string, @Body() data: Record<string, unknown>) {
    return this.entities.update(model, id, data);
  }

  @Delete(':id')
  remove(@Param('model') model: string, @Param('id') id: string) {
    return this.entities.remove(model, id);
  }

  @Post('bulk-create')
  bulkCreate(@Param('model') model: string, @Body() rows: Record<string, unknown>[]) {
    return this.entities.bulkCreate(model, rows);
  }

  @Post('bulk-update')
  bulkUpdate(@Param('model') model: string, @Body() rows: { id: string; [key: string]: unknown }[]) {
    return this.entities.bulkUpdate(model, rows);
  }
}
