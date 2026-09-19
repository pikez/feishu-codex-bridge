#!/usr/bin/env bash
# 将当前 Git 工作区构建并覆盖安装到“当前 npm”的全局 prefix。
#
# 默认不会重启 daemon；传 --restart 才在安装后重启后台服务。
# 用法：
#   ./scripts/deploy.sh
#   ./scripts/deploy.sh --restart
#   ./scripts/deploy.sh --dry-run
set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY_RUN=0
RESTART=0

usage() {
  cat <<'EOF'
Usage: scripts/deploy.sh [--restart] [--dry-run]

Build and install this checkout into the current npm global prefix. This replaces
any globally installed package with the same package name and therefore preserves
the feishu-codex-bridge command path.

Options:
  --restart  Restart the background daemon after a successful install.
  --dry-run  Print the target and planned actions without changing anything.
  -h, --help Show this help.
EOF
}

die() {
  printf '✗ %s\n' "$*" >&2
  exit 1
}

step() {
  printf '▸ %s\n' "$*"
}

for arg in "$@"; do
  case "$arg" in
    --restart) RESTART=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      usage
      exit 0
      ;;
    *) die "未知参数：$arg（试试 --help）" ;;
  esac
done

command -v node >/dev/null 2>&1 || die '未找到 node。'
command -v npm >/dev/null 2>&1 || die '未找到 npm。'

cd "$PROJECT_DIR"
PACKAGE_NAME="$(node -p "require('./package.json').name")"
PACKAGE_VERSION="$(node -p "require('./package.json').version")"
BIN_NAME="$(node - <<'NODE'
const { bin } = require('./package.json');
const names = typeof bin === 'string' ? [require('./package.json').name] : Object.keys(bin ?? {});
if (names.length !== 1) process.exit(1);
process.stdout.write(names[0]);
NODE
)" || die 'package.json 必须恰好声明一个 bin 入口。'
GLOBAL_PREFIX="$(npm prefix --global)"
GLOBAL_ROOT="$(npm root --global)"
DEPLOYED_BIN="$GLOBAL_PREFIX/bin/$BIN_NAME"
DEPLOYED_PACKAGE="$GLOBAL_ROOT/$PACKAGE_NAME/package.json"
SOURCE_CLI="$PROJECT_DIR/dist/cli.js"
DEPLOYED_CLI="$GLOBAL_ROOT/$PACKAGE_NAME/dist/cli.js"
CURRENT_BIN="$(command -v "$BIN_NAME" 2>/dev/null || true)"

sha256() {
  node -e "const { createHash } = require('node:crypto'); const { readFileSync } = require('node:fs'); process.stdout.write(createHash('sha256').update(readFileSync(process.argv[1])).digest('hex'))" "$1"
}

step "目标包：${PACKAGE_NAME}@${PACKAGE_VERSION}"
printf '  工作区：%s\n' "$PROJECT_DIR"
printf '  npm prefix：%s\n' "$GLOBAL_PREFIX"
printf '  将覆盖：%s\n' "$DEPLOYED_PACKAGE"
if [[ -n "$CURRENT_BIN" && "$CURRENT_BIN" != "$DEPLOYED_BIN" ]]; then
  printf '  ⚠ PATH 当前解析到 %s，不是此 npm prefix 的 bin；安装后请检查 PATH 优先级。\n' "$CURRENT_BIN" >&2
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  step '[dry-run] npm run build'
  step "[dry-run] npm install --global --ignore-scripts $PROJECT_DIR"
  [[ "$RESTART" -eq 1 ]] && step "[dry-run] $DEPLOYED_BIN restart"
  exit 0
fi

step '构建当前工作区'
npm run build
[[ -f "$SOURCE_CLI" ]] || die "构建后未找到 CLI bundle：$SOURCE_CLI"

step '覆盖安装到 npm 全局目录'
npm install --global --ignore-scripts "$PROJECT_DIR"

[[ -f "$DEPLOYED_PACKAGE" ]] || die "全局安装后未找到包：$DEPLOYED_PACKAGE"
[[ -x "$DEPLOYED_BIN" ]] || die "全局安装后未找到可执行文件：$DEPLOYED_BIN"
[[ -f "$DEPLOYED_CLI" ]] || die "全局安装后未找到 CLI bundle：$DEPLOYED_CLI"
INSTALLED_VERSION="$(node -p "require(process.argv[1]).version" "$DEPLOYED_PACKAGE")"
[[ "$INSTALLED_VERSION" == "$PACKAGE_VERSION" ]] || die "已安装版本 $INSTALLED_VERSION 与工作区版本 $PACKAGE_VERSION 不一致。"
[[ "$(sha256 "$SOURCE_CLI")" == "$(sha256 "$DEPLOYED_CLI")" ]] || die '全局 CLI bundle 与当前工作区构建产物不一致。'

step '验证部署后的 CLI'
CLI_VERSION="$("$DEPLOYED_BIN" --version)"
[[ "$CLI_VERSION" == "$PACKAGE_VERSION" ]] || die "CLI 返回版本 $CLI_VERSION，与工作区版本 $PACKAGE_VERSION 不一致。"
printf '✓ 已部署 %s@%s\n  %s\n' "$PACKAGE_NAME" "$PACKAGE_VERSION" "$DEPLOYED_BIN"

if [[ "$RESTART" -eq 1 ]]; then
  step '重启后台 daemon'
  "$DEPLOYED_BIN" restart
else
  printf '提示：后台 daemon 已运行时，执行 `%s restart` 才会加载本次部署。\n' "$DEPLOYED_BIN"
fi
