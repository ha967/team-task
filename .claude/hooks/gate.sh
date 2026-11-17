#!/usr/bin/env bash
# Stop hook：AI 宣告「完成」时自动执行机械门禁（lint / 类型检查 / 单元测试）。
# 全部通过 → exit 0 放行；任一失败 → exit 2，stderr 会回灌给模型让它自己修。
set -uo pipefail;

input=$(cat);

# 防止无限循环：上一轮已经因门禁被拦过，这次不再拦，把决定权交回用户
if printf '%s' "$input" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0;
fi;

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0;

# 本轮没有代码改动就直接放行：Stop 每轮回复都触发，纯对话轮次不该付几秒门禁成本。
# 只看 src / test 和会影响检查结果的 tsconfig；改 docs / web 时门禁本来也验不到东西。
# GATE_ALWAYS=1 可强制跑（改了工具链想立刻验证时用）。
if [ "${GATE_ALWAYS:-0}" != "1" ]; then
  # 不是 git 仓库时无从判断改动，宁可跑门禁（fail-safe）
  if git rev-parse --git-dir > /dev/null 2>&1; then
    changed=$(git status --porcelain=v1 -uall -- src test tsconfig.json tsconfig.build.json tsconfig.test.json 2>/dev/null);
    if [ -z "$changed" ]; then
      exit 0;
    fi;
  fi;
fi;

failed=0;

# 执行一步门禁，失败则记录错误输出但不中断后续步骤（一次把问题全暴露出来）
run_step() {
  local label="$1";
  shift;
  local output;
  if ! output=$("$@" 2>&1); then
    printf '\n❌ %s 失败：\n%s\n' "$label" "$output" >&2;
    failed=1;
  fi;
}

# lint 默认只拦截 error（oxlint 的 warning 不产生非 0 退出码）；GATE_STRICT=1 时 warning 也算失败
if [ "${GATE_STRICT:-0}" = "1" ]; then
  run_step "lint（npm run lint --deny-warnings）" npm run lint --silent -- --deny-warnings;
else
  run_step "lint（npm run lint）" npm run lint --silent;
fi;

# 只检查后端 src/：根目录 tsc --noEmit 会把 web/ 的 JSX 一起扫进来并报错
run_step "类型检查（tsc -p tsconfig.build.json）" npx tsc -p tsconfig.build.json --noEmit;

# 测试文件的类型不在 tsconfig.build.json 的 include 里，单独用 tsconfig.test.json 检查，
# 否则测试写错了类型也看不出来（vitest 只做转译，不做类型检查）
run_step "测试类型检查（tsc -p tsconfig.test.json）" npx tsc -p tsconfig.test.json;

# 单元测试与 e2e 用两套 vitest 配置，各自「有对应文件时才跑」——
# vitest 在没有任何匹配文件时会 exit 1，无条件跑会误拦。
shopt -s globstar nullglob;

spec_files=(src/**/*.spec.ts test/**/*.spec.ts);
if [ "${#spec_files[@]}" -gt 0 ]; then
  run_step "单元测试（npm test）" npm test;
fi;

e2e_files=(src/**/*.e2e-spec.ts test/**/*.e2e-spec.ts);
if [ "${#e2e_files[@]}" -gt 0 ]; then
  run_step "e2e 测试（npm run test:e2e）" npm run test:e2e;
fi;

if [ "$failed" -ne 0 ]; then
  printf '\n门禁未通过：请先修掉上面这些报错，再宣告完成。\n' >&2;
  printf '如果失败的是 e2e，先确认 Postgres 已启动：docker compose up -d\n' >&2;
  exit 2;
fi;

exit 0;
