import { ApiProperty } from '@nestjs/swagger';

export class TwoFactorChallengeDto {
  @ApiProperty()
  twoFactorRequired!: boolean;

  @ApiProperty()
  challengeToken!: string;
}
