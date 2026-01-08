#!/bin/bash

# Script để dọn dẹp cache và data rác để giải phóng bộ nhớ
# Chạy: bash cleanup-storage.sh

echo "🧹 Bắt đầu dọn dẹp storage..."
echo ""

# Tổng dung lượng trước khi dọn
echo "📊 Kiểm tra dung lượng trước khi dọn:"
df -h / | tail -1
echo ""

# 1. Dọn Yarn cache (21GB)
echo "🗑️  Đang xóa Yarn cache (~21GB)..."
if [ -d ~/Library/Caches/Yarn ]; then
    SIZE_BEFORE=$(du -sh ~/Library/Caches/Yarn 2>/dev/null | cut -f1)
    echo "   Kích thước trước: $SIZE_BEFORE"
    yarn cache clean 2>/dev/null || rm -rf ~/Library/Caches/Yarn/*
    echo "   ✅ Đã xóa Yarn cache"
fi
echo ""

# 2. Dọn npm cache (5.8GB)
echo "🗑️  Đang xóa npm cache (~5.8GB)..."
if [ -d ~/.npm ]; then
    SIZE_BEFORE=$(du -sh ~/.npm 2>/dev/null | cut -f1)
    echo "   Kích thước trước: $SIZE_BEFORE"
    npm cache clean --force 2>/dev/null || rm -rf ~/.npm/*
    echo "   ✅ Đã xóa npm cache"
fi
echo ""

# 3. Dọn .cache (5.2GB)
echo "🗑️  Đang xóa .cache (~5.2GB)..."
if [ -d ~/.cache ]; then
    SIZE_BEFORE=$(du -sh ~/.cache 2>/dev/null | cut -f1)
    echo "   Kích thước trước: $SIZE_BEFORE"
    # Giữ lại một số thư mục quan trọng, xóa phần còn lại
    find ~/.cache -mindepth 1 -maxdepth 1 -type d ! -name "pip" -exec rm -rf {} + 2>/dev/null
    echo "   ✅ Đã xóa .cache (giữ lại pip cache)"
fi
echo ""

# 4. Dọn Cargo cache (4.5GB)
echo "🗑️  Đang xóa Cargo cache (~4.5GB)..."
if [ -d ~/.cargo ]; then
    SIZE_BEFORE=$(du -sh ~/.cargo 2>/dev/null | cut -f1)
    echo "   Kích thước trước: $SIZE_BEFORE"
    cargo clean 2>/dev/null || rm -rf ~/.cargo/registry/cache/* ~/.cargo/git/db/* 2>/dev/null
    echo "   ✅ Đã xóa Cargo cache"
fi
echo ""

# 5. Dọn Gradle cache (920MB)
echo "🗑️  Đang xóa Gradle cache (~920MB)..."
if [ -d ~/.gradle ]; then
    SIZE_BEFORE=$(du -sh ~/.gradle 2>/dev/null | cut -f1)
    echo "   Kích thước trước: $SIZE_BEFORE"
    rm -rf ~/.gradle/caches/* 2>/dev/null
    echo "   ✅ Đã xóa Gradle cache"
fi
echo ""

# 6. Dọn Docker (874MB)
echo "🗑️  Đang xóa Docker unused data (~874MB)..."
if command -v docker &> /dev/null; then
    docker system prune -af --volumes 2>/dev/null || echo "   ⚠️  Docker không chạy hoặc không có quyền"
    echo "   ✅ Đã dọn Docker"
fi
echo ""

# 7. Dọn các cache khác
echo "🗑️  Đang xóa các cache khác..."

# TypeScript cache
if [ -d ~/Library/Caches/typescript ]; then
    rm -rf ~/Library/Caches/typescript/* 2>/dev/null
    echo "   ✅ Đã xóa TypeScript cache"
fi

# pip cache (có thể xóa nếu không cần)
# echo "   Xóa pip cache? (y/n)"
# read -r answer
# if [ "$answer" = "y" ]; then
#     pip cache purge 2>/dev/null || rm -rf ~/Library/Caches/pip/* 2>/dev/null
#     echo "   ✅ Đã xóa pip cache"
# fi

# JetBrains cache
if [ -d ~/Library/Caches/JetBrains ]; then
    rm -rf ~/Library/Caches/JetBrains/*/caches/* 2>/dev/null
    echo "   ✅ Đã xóa JetBrains cache"
fi

# Microsoft Edge cache
if [ -d ~/Library/Caches/Microsoft\ Edge ]; then
    rm -rf ~/Library/Caches/Microsoft\ Edge/* 2>/dev/null
    echo "   ✅ Đã xóa Microsoft Edge cache"
fi

# Playwright cache
if [ -d ~/Library/Caches/ms-playwright ]; then
    rm -rf ~/Library/Caches/ms-playwright/* 2>/dev/null
    echo "   ✅ Đã xóa Playwright cache"
fi

# Hardhat cache
if [ -d ~/Library/Caches/hardhat-nodejs ]; then
    rm -rf ~/Library/Caches/hardhat-nodejs/* 2>/dev/null
    echo "   ✅ Đã xóa Hardhat cache"
fi

# pnpm cache
if [ -d ~/Library/Caches/pnpm ]; then
    pnpm store prune 2>/dev/null || rm -rf ~/Library/Caches/pnpm/* 2>/dev/null
    echo "   ✅ Đã xóa pnpm cache"
fi

# Go build cache
if [ -d ~/Library/Caches/go-build ]; then
    go clean -cache 2>/dev/null || rm -rf ~/Library/Caches/go-build/* 2>/dev/null
    echo "   ✅ Đã xóa Go build cache"
fi

echo ""

# Tổng dung lượng sau khi dọn
echo "📊 Kiểm tra dung lượng sau khi dọn:"
df -h / | tail -1
echo ""

# Tính toán dung lượng đã giải phóng
echo "✅ Hoàn tất dọn dẹp!"
echo ""
echo "💡 Lưu ý:"
echo "   - Các cache sẽ được tạo lại khi bạn sử dụng lại các công cụ"
echo "   - Nếu cần giải phóng thêm, có thể xóa:"
echo "     • ~/Library/Caches/Yarn (21GB) - đã xóa"
echo "     • ~/.npm (5.8GB) - đã xóa"
echo "     • ~/.cache (5.2GB) - đã xóa một phần"
echo "     • ~/.cargo (4.5GB) - đã xóa cache"
echo ""

