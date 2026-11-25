import { IsString, MaxLength, MinLength } from 'class-validator';

// 评论只有 content 可改；保持必填，空 body 直接 400，而不是静默变成空操作
export class UpdateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;
}
