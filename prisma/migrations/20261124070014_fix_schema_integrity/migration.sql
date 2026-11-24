-- 本文件由 `prisma migrate dev --create-only` 生成后**手工编辑**：
-- 部分唯一索引（带 WHERE）和 CHECK 约束都无法用 Prisma schema DSL 表达，
-- 只能写在这里。改动这两类对象时请继续手写，不要指望 `prisma migrate dev` 能重新生成。

-- DropForeignKey
ALTER TABLE "comments" DROP CONSTRAINT "comments_author_id_fkey";

-- DropIndex
-- 原先是全量唯一索引：用户被软删（deleted_at 非空）后，邮箱和用户名仍然占着唯一约束，
-- 新人用同一邮箱注册会撞 ConflictException，而按 deletedAt: null 查又查不到人。
DROP INDEX "users_email_key";

-- DropIndex
DROP INDEX "users_username_key";

-- CreateIndex（手工新增）
-- 只对「未软删」的行唯一：软删行的邮箱/用户名可以被重新注册，历史行原样保留。
CREATE UNIQUE INDEX "users_email_active_key" ON "users" ("email") WHERE "deleted_at" IS NULL;

-- CreateIndex（手工新增）
CREATE UNIQUE INDEX "users_username_active_key" ON "users" ("username") WHERE "deleted_at" IS NULL;

-- AddCheckConstraint（手工新增）
-- 应用层已由 CreateTaskDto 的 @Min(0) @Max(3) 挡了，这里兜底绕过 API 的写库路径（Studio / psql / 脚本）。
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_priority_range" CHECK ("priority" BETWEEN 0 AND 3);

-- AddForeignKey
-- 删用户不再连带删评论：评论是团队的历史资产（原来是 ON DELETE CASCADE）。
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
