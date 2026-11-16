import { ApiProperty } from '@nestjs/swagger';

export enum DocumentMatchSource {
  Content = 'content',
  Summary = 'summary',
}

export class DocumentMatchDto {
  @ApiProperty({ enum: DocumentMatchSource })
  source!: DocumentMatchSource;

  @ApiProperty()
  snippet!: string;
}
