import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class PageQueryDto {
  @ApiPropertyOptional({ type: 'integer', default: 1, minimum: 1, maximum: 100_000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  page = 1;

  @ApiPropertyOptional({ type: 'integer', default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class Page<T> {
  readonly meta: { page: number; limit: number; total: number };

  constructor(readonly items: T[], total: number, query: PageQueryDto) {
    this.meta = { page: query.page, limit: query.limit, total };
  }
}
