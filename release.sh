#!/bin/bash

# --- 配置 ---
# 要打包的目录 (例如 dev 或 dist)
BUILD_DIR="dev"
# 打包后的 zip 文件名
PACKAGE_NAME="package.zip"
# 远程 Git 仓库别名
REMOTE_NAME="origin"
# --- 配置结束 ---

# 0. 检查工具
command -v pnpm >/dev/null 2>&1 || { echo >&2 "错误：未找到 pnpm。请先安装。"; exit 1; }
command -v git >/dev/null 2>&1 || { echo >&2 "错误：未找到 git。请先安装。"; exit 1; }
command -v gh >/dev/null 2>&1 || { echo >&2 "错误：未找到 GitHub CLI (gh)。请先安装并使用 'gh auth login' 登录。"; exit 1; }
command -v 7z >/dev/null 2>&1 || { echo >&2 "错误：未找到 zip 命令。请先安装。"; exit 1; }

# 1. 获取版本号/标签名
# 尝试从 package.json 读取 version
VERSION=$(node -p "require('./plugin.json').version")
if [ -z "$VERSION" ]; then
  echo "错误：无法从 plugin.json 读取版本号。"
  read -p "请输入要创建的标签名 (例如 v1.0.0): " TAG_NAME
else
  TAG_NAME="v$VERSION"
  echo "从 plugin.json 检测到版本: $VERSION，将使用标签: $TAG_NAME"
  read -p "确认使用此标签吗? (Y/n): " confirm
  if [[ "$confirm" =~ ^[Nn]$ ]]; then
    read -p "请输入要创建的标签名: " TAG_NAME
  fi
fi

if [ -z "$TAG_NAME" ]; then
  echo "错误：标签名不能为空。"
  exit 1
fi

# 2. 检查标签是否已存在
TAG_EXISTS_LOCALLY=false
TAG_EXISTS_REMOTELY=false
SKIP_TAG_OPERATIONS=false

if git rev-parse "$TAG_NAME" >/dev/null 2>&1; then
  TAG_EXISTS_LOCALLY=true
fi
if git ls-remote --tags "$REMOTE_NAME" | grep -q "refs/tags/$TAG_NAME$"; then
  TAG_EXISTS_REMOTELY=true
fi

if [ "$TAG_EXISTS_LOCALLY" = true ] || [ "$TAG_EXISTS_REMOTELY" = true ]; then
  echo "警告：标签 '$TAG_NAME' 已存在 (本地: $TAG_EXISTS_LOCALLY, 远程: $TAG_EXISTS_REMOTELY)。"
  read -p "是否跳过标签创建和推送，直接进行 GitHub Release 创建/更新和附件上传? (y/N): " confirm_skip_tag
  if [[ "$confirm_skip_tag" =~ ^[Yy]$ ]]; then
    SKIP_TAG_OPERATIONS=true
    # 如果标签只在本地存在，则需要先推送到远程
    if [ "$TAG_EXISTS_LOCALLY" = true ] && [ "$TAG_EXISTS_REMOTELY" = false ]; then
      echo "--- 标签 '$TAG_NAME' 只存在于本地，正在推送到远程 '$REMOTE_NAME' ---"
      git push "$REMOTE_NAME" "$TAG_NAME" || { echo >&2 "错误：推送本地存在的标签 '$TAG_NAME' 失败。"; exit 1; }
    # 如果标签只在远程存在，则需要先拉取到本地 (确保 git log 能正确工作)
    elif [ "$TAG_EXISTS_REMOTELY" = true ] && [ "$TAG_EXISTS_LOCALLY" = false ]; then
      echo "--- 正在从远程获取标签 '$TAG_NAME' ---"
      git fetch "$REMOTE_NAME" tag "$TAG_NAME" --no-tags || { echo >&2 "错误：从远程获取标签失败。"; exit 1; } # 使用 --no-tags 避免获取不必要的其他标签
    fi
    echo "将跳过 Git 标签创建和推送步骤 (如果需要，已确保标签存在于远程)。"
  else
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
(cd "$BUILD_DIR" && 7z a -r "../$PACKAGE_NAME" .) || { echo >&2 "错误：使用 7z 打包失败。"; exit 1; }
# 或者，如果不进入目录：
# zip -r "$PACKAGE_NAME" "$BUILD_DIR" || { echo >&2 "错误：打包失败。"; exit 1; }
echo "--- 打包完成: $PACKAGE_NAME ---"

# 7. 创建并推送 Git 标签
if [ "$SKIP_TAG_OPERATIONS" != "true" ]; then
  echo "--- 创建 Git 标签 ---"
  git tag -a "$TAG_NAME" -m "Release $TAG_NAME" || { echo >&2 "错误：创建 Git 标签失败。"; exit 1; }
  echo "--- 推送 Git 标签 ---"
  git push "$REMOTE_NAME" "$TAG_NAME" || { echo >&2 "错误：推送 Git 标签失败。"; exit 1; }
else
  echo "--- 跳过 Git 标签创建和推送 ---"
fi
# 8. 创建 GitHub Release 并上传附件
echo "--- 创建 GitHub Release 并上传附件 ---"
# 获取上一个 Release 标签
PREV_TAG=$(git tag --sort=-creatordate | grep -v "^$TAG_NAME$" | head -n 1)

if [ -n "$PREV_TAG" ]; then
  # 获取上一个 Release 标签到当前标签之间的所有提交
  RELEASE_NOTES=$(git log "$PREV_TAG"..HEAD --pretty=format:"- %s (%an)" --reverse)
else
  # 如果没有上一个标签，则获取所有提交
  RELEASE_NOTES=$(git log --pretty=format:"- %s (%an)" --reverse)
fi

gh release create "$TAG_NAME" "$PACKAGE_NAME" --notes "$RELEASE_NOTES" --title "$TAG_NAME" || { echo >&2 "错误：创建 GitHub Release 或上传附件失败。"; exit 1; }

echo "--- 发布成功！---"
echo "标签 '$TAG_NAME' 已创建并推送。"
echo "GitHub Release 已创建，并已上传 '$PACKAGE_NAME'。"

# 9. 清理 (可选)
rm "$PACKAGE_NAME"

exit 0