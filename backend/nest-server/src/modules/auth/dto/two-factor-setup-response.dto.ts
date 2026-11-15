import { ApiProperty } from '@nestjs/swagger';

export class TwoFactorSetupResponseDto {
  @ApiProperty()
  qrCodeDataUrl!: string;
}
