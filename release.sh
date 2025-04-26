#!/bin/bash

# --- 配置 ---
# 要打包的目录 (例如 dev 或 dist)
BUILD_DIR="dev"
# 打包后的 zip 文件名
PACKAGE_NAME="package.zip"
# 远程 Git 仓库别名
REMOTE_NAME="siyuan-steve-tools"
# --- 配置结束 ---

# 0. 检查工具
command -v pnpm >/dev/null 2>&1 || { echo >&2 "错误：未找到 pnpm。请先安装。"; exit 1; }
command -v git >/dev/null 2>&1 || { echo >&2 "错误：未找到 git。请先安装。"; exit 1; }
command -v gh >/dev/null 2>&1 || { echo >&2 "错误：未找到 GitHub CLI (gh)。请先安装并使用 'gh auth login' 登录。"; exit 1; }
command -v zip >/dev/null 2>&1 || { echo >&2 "错误：未找到 zip 命令。请先安装。"; exit 1; }

# 1. 获取版本号/标签名
# 尝试从 package.json 读取 version
VERSION=$(node -p "require('./package.json').version")
if [ -z "$VERSION" ]; then
  echo "错误：无法从 package.json 读取版本号。"
  read -p "请输入要创建的标签名 (例如 v1.0.0): " TAG_NAME
else
  TAG_NAME="v$VERSION"
  echo "从 package.json 检测到版本: $VERSION，将使用标签: $TAG_NAME"
  read -p "确认使用此标签吗? (y/N): " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    read -p "请输入要创建的标签名: " TAG_NAME
  fi
fi

if [ -z "$TAG_NAME" ]; then
  echo "错误：标签名不能为空。"
  exit 1
fi

# 2. 检查标签是否已存在
if git rev-parse "$TAG_NAME" >/dev/null 2>&1; then
  echo "警告：标签 '$TAG_NAME' 在本地已存在。"
  read -p "是否继续? (y/N): " confirm_tag
  if [[ ! "$confirm_tag" =~ ^[Yy]$ ]]; then
    echo "操作中止。"
    exit 0
  fi
fi
# 可以在这里添加检查远程标签的逻辑: git ls-remote --tags $REMOTE_NAME | grep "refs/tags/$TAG_NAME"

# 3. 确保工作目录干净 (可选但推荐)
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "错误：工作目录或暂存区有未提交的更改。请先提交或储藏更改。"
  exit 1
fi
echo "工作目录干净。"

# 4. 安装依赖 (如果需要构建步骤，请取消注释)
# echo "--- 安装依赖 ---"
# pnpm install || { echo >&2 "错误：pnpm install 失败。"; exit 1; }
# echo "--- 开始构建 ---"
# pnpm build || { echo >&2 "错误：pnpm build 失败。"; exit 1; }
# echo "--- 构建完成 ---"

# 5. 检查要打包的目录
if [ ! -d "$BUILD_DIR" ]; then
  echo "错误：目录 '$BUILD_DIR' 不存在。请确保该目录已准备好。"
  exit 1
fi

# 6. 打包
echo "--- 开始打包 '$BUILD_DIR' 目录 ---"
# 删除旧包（如果存在）
rm -f "$PACKAGE_NAME"
# 进入要打包的目录进行打包，避免 zip 包含父目录结构
(cd "$BUILD_DIR" && zip -r "../$PACKAGE_NAME" .) || { echo >&2 "错误：打包失败。"; exit 1; }
# 或者，如果不进入目录：
# zip -r "$PACKAGE_NAME" "$BUILD_DIR" || { echo >&2 "错误：打包失败。"; exit 1; }
echo "--- 打包完成: $PACKAGE_NAME ---"

# 7. 创建并推送 Git 标签
echo "--- 创建 Git 标签 ---"
git tag -a "$TAG_NAME" -m "Release $TAG_NAME" || { echo >&2 "错误：创建 Git 标签失败。"; exit 1; }
echo "--- 推送 Git 标签 ---"
git push "$REMOTE_NAME" "$TAG_NAME" || { echo >&2 "错误：推送 Git 标签失败。"; exit 1; }

# 8. 创建 GitHub Release 并上传附件
echo "--- 创建 GitHub Release 并上传附件 ---"
gh release create "$TAG_NAME" "$PACKAGE_NAME" --notes "Release $TAG_NAME" --title "$TAG_NAME" || { echo >&2 "错误：创建 GitHub Release 或上传附件失败。"; exit 1; }

echo "--- 发布成功！---"
echo "标签 '$TAG_NAME' 已创建并推送。"
echo "GitHub Release 已创建，并已上传 '$PACKAGE_NAME'。"

# 9. 清理 (可选)
# rm "$PACKAGE_NAME"

exit 0