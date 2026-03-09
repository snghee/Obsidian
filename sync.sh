cat > ~/sync.sh << 'EOF'
#!/bin/bash
cd ~/storage/shared/Documents/Obsidian
echo "📁 변경 파일 확인 중..."
git status --short
git add .
git commit -m "update: $(date '+%Y-%m-%d %H:%M')"
echo "🚀 GitHub에 push 중..."
git push
echo "✅ 완료!"
EOF
chmod +x ~/sync.sh
