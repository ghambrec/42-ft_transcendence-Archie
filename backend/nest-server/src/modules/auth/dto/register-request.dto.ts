import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MinLength, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterRequestDto {
    @ApiProperty({ example: 'test@example.com' })
    @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value
    )
    @IsEmail()
    email!: string;

    @ApiProperty({ example: 'password1234' })
    @IsString()
    @MinLength(8)
    password!: string;

    @ApiProperty({ example: 'name' })
    @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value
    )
    @IsString()
    @Length(1, 25)
    displayName!: string;
}
