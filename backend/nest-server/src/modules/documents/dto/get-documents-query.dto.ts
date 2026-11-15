import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DocumentFileCategory } from '../document-file.constants';

export enum DocumentSortField {
  Relevance = 'relevance',
  Name = 'name',
  CreatedAt = 'createdAt',
  Size = 'size',
}

export enum SortOrder {
  Asc = 'asc',
  Desc = 'desc',
}

// ein param kommt als string, mehrere als array -> immer array
const toArray = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return Array.isArray(value) ? value : [value];
};

export class GetDocumentsQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tagId?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  includeDescendants: boolean = false;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
  })
  @IsOptional()
  @Transform(toArray)
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  groupId?: string[];

  @ApiPropertyOptional({
    enum: DocumentFileCategory,
    isArray: true,
  })
  @IsOptional()
  @Transform(toArray)
  @IsEnum(DocumentFileCategory, { each: true })
  type?: DocumentFileCategory[];

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdFrom?: Date;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdTo?: Date;

  @ApiPropertyOptional({
    enum: DocumentSortField,
  })
  @IsOptional()
  @IsEnum(DocumentSortField)
  sort?: DocumentSortField;

  @ApiPropertyOptional({
    enum: SortOrder,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  order?: SortOrder;
}
