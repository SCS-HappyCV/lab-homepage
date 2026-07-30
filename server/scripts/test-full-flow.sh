#!/bin/bash

# 专利完整流程测试脚本
# 测试：上传 → 识别 → 保存

set -e

API_BASE="http://localhost:3003"
PDF_FILE="$1"

if [ -z "$PDF_FILE" ]; then
    echo "❌ 请提供PDF文件路径"
    echo "使用方法: ./scripts/test-full-flow.sh <pdf文件路径>"
    exit 1
fi

if [ ! -f "$PDF_FILE" ]; then
    echo "❌ 文件不存在: $PDF_FILE"
    exit 1
fi

echo "============================================================"
echo "📄 专利完整流程测试"
echo "============================================================"
echo ""
echo "📁 测试文件: $PDF_FILE"
echo "📊 文件大小: $(du -h "$PDF_FILE" | cut -f1)"
echo ""

# 1. 检查服务器状态
echo "🔍 步骤1: 检查服务器状态..."
HEALTH=$(curl -s "$API_BASE/health")
if echo "$HEALTH" | grep -q '"ok":true'; then
    echo "✅ 服务器运行正常"
else
    echo "❌ 服务器未运行"
    exit 1
fi
echo ""

# 2. 上传并识别
echo "📤 步骤2: 上传并识别专利PDF..."
echo "   正在上传文件..."
RECOGNIZE_RESPONSE=$(curl -s -X POST "$API_BASE/patents/recognize" \
    -F "file=@$PDF_FILE" 2>&1)

# 检查是否需要认证
if echo "$RECOGNIZE_RESPONSE" | grep -q '"error":"Unauthorized"'; then
    echo "   ⚠️  需要认证，跳过认证测试..."
    echo "   请在浏览器中测试完整流程"
    exit 0
fi

echo "📥 识别响应:"
echo "$RECOGNIZE_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RECOGNIZE_RESPONSE"
echo ""

# 3. 提取识别结果
RECOGNITION_ID=$(echo "$RECOGNIZE_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('data', {}).get('recognitionId', ''))
" 2>/dev/null || echo "")

FILE_ID=$(echo "$RECOGNIZE_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('data', {}).get('fileId', ''))
" 2>/dev/null || echo "")

STATUS=$(echo "$RECOGNIZE_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('data', {}).get('recognitionStatus', 'UNKNOWN'))
" 2>/dev/null || echo "UNKNOWN")

echo "📋 识别摘要:"
echo "   识别ID: $RECOGNITION_ID"
echo "   文件ID: $FILE_ID"
echo "   状态: $STATUS"
echo ""

# 4. 提取识别结果详情
echo "📝 识别结果:"
echo ""
echo "$RECOGNIZE_RESPONSE" | python3 -c "
import sys, json

try:
    data = json.load(sys.stdin)
    result = data.get('data', {})

    print('【专利名称】')
    name = result.get('patentName', {})
    print(f\"   值: {name.get('value', 'N/A')}\")
    print(f\"   置信度: {name.get('confidence', 0)}\")
    print()

    print('【发明人】')
    inv = result.get('inventors', {})
    print(f\"   值: {inv.get('value', 'N/A')}\")
    print(f\"   置信度: {inv.get('confidence', 0)}\")
    print()

    print('【专利类型】')
    ptype = result.get('patentType', {})
    print(f\"   值: {ptype.get('value', 'N/A')} ({ptype.get('displayValue', 'N/A')})\")
    print(f\"   置信度: {ptype.get('confidence', 0)}\")
    print()

    print('【专利号】')
    pnum = result.get('patentNumber', {})
    print(f\"   值: {pnum.get('value', 'N/A')}\")
    print(f\"   编号类型: {pnum.get('numberType', 'N/A')}\")
    print(f\"   置信度: {pnum.get('confidence', 0)}\")
    print()

    print(f\"需要人工审核: {result.get('needsManualReview', True)}\")
    print(f\"识别方法: {', '.join(result.get('recognitionMethod', []))}\")

    warnings = result.get('warnings', [])
    if warnings:
        print(f'警告数量: {len(warnings)}')
        for w in warnings:
            print(f'  - [{w.get(\"code\")}] {w.get(\"field\")}: {w.get(\"message\")}')
except Exception as e:
    print(f'解析失败: {e}')
" 2>/dev/null

echo ""

# 5. 检查识别状态
if [ "$STATUS" = "COMPLETED" ] || [ "$STATUS" = "PARTIAL" ]; then
    echo "✅ 识别成功！"
    echo ""

    # 6. 保存专利
    echo "💾 步骤3: 保存专利..."

    # 提取字段值
    PATENT_NAME=$(echo "$RECOGNIZE_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('data', {}).get('patentName', {}).get('value', ''))
" 2>/dev/null || echo "")

    INVENTORS=$(echo "$RECOGNIZE_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
inv = data.get('data', {}).get('inventors', {}).get('value', [])
print(json.dumps(inv))
" 2>/dev/null || echo "[]")

    PATENT_TYPE=$(echo "$RECOGNIZE_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('data', {}).get('patentType', {}).get('value', 'UNKNOWN'))
" 2>/dev/null || echo "UNKNOWN")

    PATENT_NUMBER=$(echo "$RECOGNIZE_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('data', {}).get('patentNumber', {}).get('value', ''))
" 2>/dev/null || echo "")

    NUMBER_TYPE=$(echo "$RECOGNIZE_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('data', {}).get('patentNumber', {}).get('numberType', 'PATENT_NUMBER'))
" 2>/dev/null || echo "PATENT_NUMBER")

    echo "   准备保存数据:"
    echo "   - 专利名称: $PATENT_NAME"
    echo "   - 发明人: $INVENTORS"
    echo "   - 专利类型: $PATENT_TYPE"
    echo "   - 专利号: $PATENT_NUMBER"
    echo ""

    # 发送保存请求
    SAVE_RESPONSE=$(curl -s -X POST "$API_BASE/patents/confirm" \
        -H "Content-Type: application/json" \
        -d "{
            \"recognitionId\": \"$RECOGNITION_ID\",
            \"fileId\": \"$FILE_ID\",
            \"patentName\": \"$PATENT_NAME\",
            \"inventors\": $INVENTORS,
            \"patentType\": \"$PATENT_TYPE\",
            \"patentNumber\": \"$PATENT_NUMBER\",
            \"numberType\": \"$NUMBER_TYPE\"
        }" 2>&1)

    echo "📥 保存响应:"
    echo "$SAVE_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$SAVE_RESPONSE"
    echo ""

    # 检查保存结果
    SAVE_CODE=$(echo "$SAVE_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('code', 0))
" 2>/dev/null || echo "0")

    if [ "$SAVE_CODE" = "201" ]; then
        echo "✅ 专利保存成功！"
    else
        echo "❌ 专利保存失败"
    fi
else
    echo "❌ 识别失败，无法保存"
fi

echo ""
echo "============================================================"
echo "📊 测试总结"
echo "============================================================"
echo ""

# 7. 验证保存结果
echo "🔍 验证保存结果..."
LIST_RESPONSE=$(curl -s "$API_BASE/patents?page=1&pageSize=10" 2>&1)

TOTAL=$(echo "$LIST_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('pagination', {}).get('total', 0))
" 2>/dev/null || echo "0")

echo "   当前专利总数: $TOTAL"
echo ""

# 显示最新的专利
echo "📋 最新专利列表:"
echo "$LIST_RESPONSE" | python3 -c "
import sys, json

try:
    data = json.load(sys.stdin)
    patents = data.get('data', [])

    for i, p in enumerate(patents[:5], 1):
        print(f\"   {i}. {p.get('title', 'N/A')}\")
        print(f\"      专利号: {p.get('patent_number', 'N/A')}\")
        print(f\"      类型: {p.get('patent_type', 'N/A')}\")
        print()
except Exception as e:
    print(f'解析失败: {e}')
" 2>/dev/null

echo ""
echo "✅ 测试完成！"
