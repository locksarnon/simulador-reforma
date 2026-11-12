import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
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
  async remove(@Param('model') model: string, @Param('id') id: string, @CurrentUser() user: AuthUser) {
    // Clientes não são excluídos: só arquivados (POST /clientes/:id/arquivar). Grupo com empresas também não sai.
    if (model === 'Empresa') throw new ForbiddenException('Clientes não são excluídos. Use Arquivar: o cliente sai das listas e o histórico fica guardado.');
    if (model === 'Grupo') await this.entities.exigirGrupoVazio(id);
    return this.entities.remove(model, id, user);
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
