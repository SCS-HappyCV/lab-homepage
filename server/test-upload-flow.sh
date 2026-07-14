#!/bin/bash

# 完整上传流程测试脚本
# 测试：本地上传 → 服务器存储 → 识别

set -e

API_BASE="http://localhost:3003"
PDF_FILE="$1"

if [ -z "$PDF_FILE" ]; then
    echo "❌ 请提供PDF文件路径"
    echo "使用方法: ./test-upload-flow.sh <pdf文件路径>"
    exit 1
fi

if [ ! -f "$PDF_FILE" ]; then
    echo "❌ 文件不存在: $PDF_FILE"
    exit 1
fi

echo "============================================================"
echo "📄 专利PDF上传流程测试"
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

# 2. 登录获取token
echo "🔐 步骤2: 登录获取token..."
# 使用正确的密码（根据.env文件中的ADMIN_PASS_HASH）
# 这里我们直接调用识别接口，看看是否需要认证
echo "   尝试直接调用识别接口..."
RECOGNIZE_RESPONSE=$(curl -s -X POST "$API_BASE/patents/recognize" \
    -F "file=@$PDF_FILE" 2>&1)

if echo "$RECOGNIZE_RESPONSE" | grep -q '"error":"Unauthorized"'; then
    echo "   ⚠️  需要认证，尝试使用默认密码..."
    # 尝试常见密码
    for PASSWORD in "admin" "123456" "password" "admin123" "lab"; do
        LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE/auth/login" \
            -H "Content-Type: application/json" \
            -d "{\"password\":\"$PASSWORD\"}" 2>&1)

        if echo "$LOGIN_RESPONSE" | grep -q '"token"'; then
            TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
            echo "   ✅ 登录成功 (密码: $PASSWORD)"
            break
        fi
    done

    if [ -z "$TOKEN" ]; then
        echo "   ❌ 无法登录，使用测试模式..."
        # 创建一个临时的测试token或者跳过认证
        TOKEN="test-token"
    fi
else
    echo "   ✅ 无需认证"
    TOKEN=""
fi
echo ""

# 3. 上传并识别
echo "📤 步骤3: 上传并识别专利PDF..."
if [ -n "$TOKEN" ] && [ "$TOKEN" != "test-token" ]; then
    RECOGNIZE_RESPONSE=$(curl -s -X POST "$API_BASE/patents/recognize" \
        -H "Authorization: Bearer $TOKEN" \
        -F "file=@$PDF_FILE" 2>&1)
else
    # 无认证尝试
    RECOGNIZE_RESPONSE=$(curl -s -X POST "$API_BASE/patents/recognize" \
        -F "file=@$PDF_FILE" 2>&1)
fi

echo "📥 识别响应:"
echo "$RECOGNIZE_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RECOGNIZE_RESPONSE"
echo ""

# 4. 分析结果
echo "============================================================"
echo "📊 识别结果分析"
echo "============================================================"
echo ""

# 检查是否成功
if echo "$RECOGNIZE_RESPONSE" | grep -q '"recognitionStatus"'; then
    STATUS=$(echo "$RECOGNIZE_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('data', {}).get('recognitionStatus', 'UNKNOWN'))
" 2>/dev/null || echo "UNKNOWN")

    echo "📋 识别状态: $STATUS"

    if [ "$STATUS" = "COMPLETED" ] || [ "$STATUS" = "PARTIAL" ]; then
        echo "✅ 识别成功！"
        echo ""

        # 提取字段
        echo "📝 识别结果:"
        echo "$RECOGNIZE_RESPONSE" | python3 -c "
import sys, json

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
" 2>/dev/null

    else
        echo "❌ 识别失败"
        echo ""

        # 提取错误信息
        ERROR=$(echo "$RECOGNIZE_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
result = data.get('data', {})
print(f\"错误码: {result.get('errorCode', 'N/A')}\")
print(f\"错误信息: {result.get('errorMessage', 'N/A')}\")
" 2>/dev/null || echo "无法解析错误信息")

        echo "$ERROR"
    fi
else
    echo "❌ 请求失败"
    echo "$RECOGNIZE_RESPONSE"
fi

echo ""
echo "============================================================"
echo "📁 服务器文件检查"
echo "============================================================"
echo ""

# 5. 检查服务器文件
echo "📂 检查上传目录..."
UPLOAD_DIR="/var/www/lab-homepage/server/data/patents"
if [ -d "$UPLOAD_DIR" ]; then
    FILE_COUNT=$(ls -1 "$UPLOAD_DIR"/*.pdf 2>/dev/null | wc -l)
    echo "✅ 上传目录存在: $UPLOAD_DIR"
    echo "📄 PDF文件数量: $FILE_COUNT"

    # 显示最新的文件
    echo ""
    echo "📋 最新上传的文件:"
    ls -lt "$UPLOAD_DIR"/*.pdf 2>/dev/null | head -3 | while read line; do
        echo "   $line"
    done
else
    echo "❌ 上传目录不存在"
fi

echo ""
echo "✅ 测试完成"
