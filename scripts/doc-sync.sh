#!/usr/bin/env bash
# 定时文档巡检：拉最新代码 → 无头 agent 修正过时文档并 commit → 只含 .md 改动才 push。
# 由 Windows 任务计划「XXJL-doc-sync」调用；手动跑：bash scripts/doc-sync.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p logs
exec >>"logs/doc-sync.log" 2>&1
echo "===== $(date '+%F %T') ====="

# 工作区有未提交改动时不动，免得覆盖手头工作
if [ -n "$(git status --porcelain)" ]; then echo "工作区不干净，跳过"; exit 0; fi
git checkout main
git pull --ff-only
out=$(tclaude -p "$(cat scripts/doc-sync-prompt.md)" \
  --permission-mode acceptEdits \
  --allowedTools "Read" "Glob" "Grep" "Edit" "Write" \
    "Bash(git log:*)" "Bash(git diff:*)" "Bash(git status:*)" "Bash(git show:*)" \
  --max-budget-usd 3)
echo "$out"

changed=$(git status --porcelain)
[ -z "$changed" ] && { echo "无改动"; exit 0; }

# 安全闸：出现非 .md 改动（含新建文件）一律丢弃，不提交
if echo "$changed" | grep -qv '\.md$'; then
  echo "检测到非文档改动，丢弃："; echo "$changed"
  git checkout -- . && git clean -fd -q; exit 1
fi
msg=$(echo "$out" | sed -n 's/^COMMIT: *//p' | head -1)
git add -A
git commit -qm "${msg:-文档巡检：同步文档与代码}"
git push origin main
echo "已推送：$(git log --oneline -1)"
