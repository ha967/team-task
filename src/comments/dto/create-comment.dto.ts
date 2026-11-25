import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
  // 不做 trim：与 CreateTaskDto.title 的既有行为保持一致，纯空白内容也能通过。
  // 要拦的话应在 DTO 层统一加 @Transform，而不是只给评论打补丁。
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;
}
