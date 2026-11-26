-- 手工编写的迁移（`prisma migrate dev --create-only` 在本环境是非交互的，无法直接生成）。
-- 两点无法交给 Prisma：
--   1) id 是 Prisma 客户端生成的 UUID，库层没有默认值；既有行必须先加可空列、回填、再收紧。
--   2) 带 WHERE 的部分唯一索引无法用 Prisma schema DSL 表达，只能写在迁移 SQL 里。
-- 改这两类对象时请继续手写，不要指望 `prisma migrate dev` 能重新生成。

-- AlterTable：先加可空列
ALTER TABLE "team_members" ADD COLUMN "id" UUID;

-- 回填既有成员关系行（PostgreSQL 13+ 内置 gen_random_uuid()）
UPDATE "team_members" SET "id" = gen_random_uuid() WHERE "id" IS NULL;

-- 回填完成后再收紧为 NOT NULL
ALTER TABLE "team_members" ALTER COLUMN "id" SET NOT NULL;

-- 主键从 (team_id, user_id) 换成 id：允许同一人退出后重新加入产生多段历史
ALTER TABLE "team_members" DROP CONSTRAINT "team_members_pkey";
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("id");

-- 离开时间：null = 仍在团队中；有值 = 历史记录
ALTER TABLE "team_members" ADD COLUMN "left_at" TIMESTAMPTZ(3);

-- 同一时刻同一人只能有一条活跃关系；已离开的历史行可以有多条
CREATE UNIQUE INDEX "team_members_active_key"
  ON "team_members" ("team_id", "user_id")
  WHERE "left_at" IS NULL;

-- DropIndex：原来的反向索引不带 left_at，换成能服务「我加入的团队」查询的复合索引
DROP INDEX "team_members_user_id_idx";

-- CreateIndex
CREATE INDEX "team_members_user_id_left_at_idx" ON "team_members" ("user_id", "left_at");
