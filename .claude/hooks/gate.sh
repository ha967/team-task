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

# 项目当前没有单元测试，vitest 在无 spec 时会 exit 1；等出现 spec 文件再自动纳入门禁
shopt -s globstar nullglob;
spec_files=(src/**/*.spec.ts test/**/*.spec.ts);
if [ "${#spec_files[@]}" -gt 0 ]; then
  run_step "单元测试（npm test）" npm test;
fi;

if [ "$failed" -ne 0 ]; then
  printf '\n门禁未通过：请先修掉上面这些报错，再宣告完成。\n' >&2;
  exit 2;
fi;

exit 0;
