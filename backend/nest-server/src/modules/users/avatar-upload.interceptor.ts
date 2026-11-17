import { CallHandler, ExecutionContext, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApplicationException } from 'src/common/errors/application.exception';
import { ErrorCode } from 'src/common/errors/error-code';
import { MAX_AVATAR_SIZE_BYTES } from './avatar.constants';

const AvatarFileInterceptor = FileInterceptor('file', { limits: { fileSize: MAX_AVATAR_SIZE_BYTES } });

@Injectable()
export class AvatarUploadInterceptor extends AvatarFileInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler) {
    try {
      return await super.intercept(context, next);
    } catch (error) {
      if (error instanceof PayloadTooLargeException) {
        throw new ApplicationException(ErrorCode.AvatarFileTooLarge);
      }
      throw error;
    }
  }
}
