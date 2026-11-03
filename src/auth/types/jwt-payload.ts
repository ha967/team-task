export interface JwtPayload {
  // 用户 ID。JWT 标准里 sub 表示 subject，即"这个令牌代表谁"
  sub: string;
  // 以下字段由 jsonwebtoken 在签发时自动写入，这里只是声明方便类型推断
  iat?: number;
  exp?: number;
}
