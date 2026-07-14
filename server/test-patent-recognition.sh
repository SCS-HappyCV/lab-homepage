#!/bin/bash

# 专利识别测试脚本
# 使用方法: ./test-patent-recognition.sh <pdf文件路径>

set -e

API_BASE="http://localhost:3003"
PDF_FILE="$1"

if [ -z "$PDF_FILE" ]; then
    echo "❌ 请提供PDF文件路径"
    echo "使用方法: ./test-patent-recognition.sh <pdf文件路径>"
    exit 1
fi

if [ ! -f "$PDF_FILE" ]; then
    echo "❌ 文件不存在: $PDF_FILE"
    exit 1
fi

echo "📄 测试文件: $PDF_FILE"
echo "📊 文件大小: $(du -h "$PDF_FILE" | cut -f1)"
echo ""

# 1. 登录获取token
echo "🔐 步骤1: 登录获取token..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"password":"admin123"}')

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "❌ 登录失败"
    echo "响应: $LOGIN_RESPONSE"
    exit 1
fi

echo "✅ 登录成功"
echo ""

# 2. 上传并识别专利
echo "📤 步骤2: 上传并识别专利..."
RECOGNIZE_RESPONSE=$(curl -s -X POST "$API_BASE/patents/recognize" \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@$PDF_FILE")

echo "📥 识别响应:"
echo "$RECOGNIZE_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RECOGNIZE_RESPONSE"
echo ""

# 3. 提取识别结果
RECOGNITION_ID=$(echo "$RECOGNIZE_RESPONSE" | grep -o '"recognitionId":"[^"]*"' | cut -d'"' -f4)
FILE_ID=$(echo "$RECOGNIZE_RESPONSE" | grep -o '"fileId":"[^"]*"' | cut -d'"' -f4)
STATUS=$(echo "$RECOGNIZE_RESPONSE" | grep -o '"recognitionStatus":"[^"]*"' | cut -d'"' -f4)
NEEDS_REVIEW=$(echo "$RECOGNIZE_RESPONSE" | grep -o '"needsManualReview":[^,}]*' | cut -d':' -f2)

echo "📋 识别摘要:"
echo "   识别ID: $RECOGNITION_ID"
echo "   文件ID: $FILE_ID"
echo "   状态: $STATUS"
echo "   需要人工审核: $NEEDS_REVIEW"
echo ""

# 4. 提取各字段结果
echo "📝 识别结果:"
echo ""

# 专利名称
PATENT_NAME=$(echo "$RECOGNIZE_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
result = data.get('data', {})
name = result.get('patentName', {})
print(f\"值: {name.get('value', 'N/A')}\")
print(f\"置信度: {name.get('confidence', 0)}\")
print(f\"来源: {name.get('source', 'N/A')}\")
print(f\"证据: {name.get('evidence', 'N/A')}\")
" 2>/dev/null || echo "解析失败")

echo "【专利名称】"
echo "$PATENT_NAME"
echo ""

# 发明人
INVENTORS=$(echo "$RECOGNIZE_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
result = data.get('data', {})
inv = result.get('inventors', {})
print(f\"值: {inv.get('value', 'N/A')}\")
print(f\"置信度: {inv.get('confidence', 0)}\")
print(f\"来源: {inv.get('source', 'N/A')}\")
print(f\"证据: {inv.get('evidence', 'N/A')}\")
" 2>/dev/null || echo "解析失败")

echo "【发明人】"
echo "$INVENTORS"
echo ""

# 专利类型
PATENT_TYPE=$(echo "$RECOGNIZE_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
result = data.get('data', {})
ptype = result.get('patentType', {})
print(f\"值: {ptype.get('value', 'N/A')}\")
print(f\"显示值: {ptype.get('displayValue', 'N/A')}\")
print(f\"置信度: {ptype.get('confidence', 0)}\")
print(f\"来源: {ptype.get('source', 'N/A')}\")
print(f\"证据: {ptype.get('evidence', 'N/A')}\")
" 2>/dev/null || echo "解析失败")

echo "【专利类型】"
echo "$PATENT_TYPE"
echo ""

# 专利号
PATENT_NUMBER=$(echo "$RECOGNIZE_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
result = data.get('data', {})
pnum = result.get('patentNumber', {})
print(f\"值: {pnum.get('value', 'N/A')}\")
print(f\"编号类型: {pnum.get('numberType', 'N/A')}\")
print(f\"置信度: {pnum.get('confidence', 0)}\")
print(f\"来源: {pnum.get('source', 'N/A')}\")
print(f\"证据: {pnum.get('evidence', 'N/A')}\")
candidates = pnum.get('candidates', [])
if candidates:
    print(f\"候选值: {candidates}\")
" 2>/dev/null || echo "解析失败")

echo "【专利号】"
echo "$PATENT_NUMBER"
echo ""

# 5. 显示警告信息
WARNINGS=$(echo "$RECOGNIZE_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
result = data.get('data', {})
warnings = result.get('warnings', [])
if warnings:
    for w in warnings:
        print(f\"- [{w.get('code', 'N/A')}] {w.get('field', 'N/A')}: {w.get('message', 'N/A')}\")
else:
    print('无警告')
" 2>/dev/null || echo "解析失败")

echo "⚠️  警告信息:"
echo "$WARNINGS"
echo ""

# 6. 显示识别方法
METHODS=$(echo "$RECOGNIZE_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
result = data.get('data', {})
methods = result.get('recognitionMethod', [])
print(' -> '.join(methods))
" 2>/dev/null || echo "解析失败")

echo "🔧 识别方法: $METHODS"
echo ""

echo "✅ 测试完成"
