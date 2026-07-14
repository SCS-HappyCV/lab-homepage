<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X, CheckCircle, AlertTriangle, Eye, ChevronDown, ChevronUp } from 'lucide-vue-next'
import { memberApi, type RecognizeResponse, type PatentType, type NumberType } from '../utils/api'

interface Props {
  visible: boolean
  recognitionResult: RecognizeResponse | null
}

interface Emits {
  (e: 'close'): void
  (e: 'saved', patentId: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// 表单数据
const patentName = ref('')
const inventors = ref<string[]>([])
const patentType = ref<PatentType>('UNKNOWN')
const patentNumber = ref('')
const numberType = ref<NumberType>('PATENT_NUMBER')

// 新发明人输入
const newInventor = ref('')

// 展开原文依据
const showEvidence = ref<Record<string, boolean>>({})

// 状态
const isSaving = ref(false)
const error = ref('')
const duplicateWarning = ref('')

// 专利类型选项
const patentTypeOptions = [
  { value: 'INVENTION', label: '发明专利' },
  { value: 'UTILITY_MODEL', label: '实用新型专利' },
  { value: 'DESIGN', label: '外观设计专利' },
  { value: 'UNKNOWN', label: '未知' },
]

// 编号类型选项
const numberTypeOptions = [
  { value: 'PATENT_NUMBER', label: '专利号' },
  { value: 'AUTHORIZATION_NUMBER', label: '授权公告号' },
  { value: 'PUBLICATION_NUMBER', label: '申请公布号' },
  { value: 'APPLICATION_NUMBER', label: '申请号' },
]

// 监听识别结果变化，初始化表单
watch(() => props.recognitionResult, (result) => {
  if (result) {
    patentName.value = typeof result.patentName.value === 'string' ? result.patentName.value : ''
    inventors.value = Array.isArray(result.inventors.value) ? [...result.inventors.value] : []
    patentType.value = (result.patentType.value as PatentType) || 'UNKNOWN'
    patentNumber.value = typeof result.patentNumber.value === 'string' ? result.patentNumber.value : ''
    numberType.value = result.patentNumber.numberType || 'PATENT_NUMBER'
    duplicateWarning.value = ''
    error.value = ''
  }
}, { immediate: true })

// 添加发明人
function addInventor() {
  const name = newInventor.value.trim()
  if (name && !inventors.value.includes(name)) {
    inventors.value.push(name)
    newInventor.value = ''
  }
}

// 删除发明人
function removeInventor(index: number) {
  inventors.value.splice(index, 1)
}

// 处理回车添加发明人
function handleInventorKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    addInventor()
  }
}

// 切换显示原文依据
function toggleEvidence(field: string) {
  showEvidence.value[field] = !showEvidence.value[field]
}

// 获取置信度样式
function getConfidenceClass(confidence: number): string {
  if (confidence >= 0.9) return 'confidence-high'
  if (confidence >= 0.7) return 'confidence-medium'
  return 'confidence-low'
}

// 获取置信度文本
function getConfidenceText(confidence: number): string {
  if (confidence >= 0.9) return '高置信度'
  if (confidence >= 0.7) return '中置信度'
  return '低置信度'
}

// 保存专利
async function savePatent() {
  if (!props.recognitionResult) return

  // 验证表单
  if (!patentName.value.trim()) {
    error.value = '专利名称不能为空'
    return
  }
  if (inventors.value.length === 0) {
    error.value = '发明人不能为空'
    return
  }
  if (!patentNumber.value.trim()) {
    error.value = '专利号不能为空'
    return
  }

  isSaving.value = true
  error.value = ''
  duplicateWarning.value = ''

  try {
    const result = await memberApi.confirmPatent({
      recognitionId: props.recognitionResult.recognitionId,
      fileId: props.recognitionResult.fileId,
      patentName: patentName.value.trim(),
      inventors: inventors.value,
      patentType: patentType.value,
      patentNumber: patentNumber.value.trim(),
      numberType: numberType.value,
    })

    emit('saved', result.id)
  } catch (err: any) {
    if (err.message?.includes('已存在相同专利号')) {
      duplicateWarning.value = err.message
    } else {
      error.value = err.message || '保存失败，请重试'
    }
  } finally {
    isSaving.value = false
  }
}

// 关闭弹窗
function handleClose() {
  if (!isSaving.value) {
    emit('close')
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm">
      <div v-if="visible && recognitionResult" class="confirm-overlay" @click.self="handleClose">
        <div class="confirm-dialog">
          <!-- 头部 -->
          <div class="confirm-header">
            <div class="confirm-title">
              <CheckCircle :size="24" />
              <h2>确认专利信息</h2>
            </div>
            <button class="confirm-close" @click="handleClose" :disabled="isSaving">
              <X :size="20" />
            </button>
          </div>

          <!-- 内容 -->
          <div class="confirm-body">
            <!-- 识别状态提示 -->
            <div v-if="recognitionResult.needsManualReview" class="confirm-notice">
              <AlertTriangle :size="18" />
              <p>部分字段识别置信度较低，请人工确认后保存</p>
            </div>

            <!-- 专利名称 -->
            <div class="confirm-field">
              <div class="confirm-field-header">
                <label>专利名称 *</label>
                <span
                  v-if="recognitionResult.patentName.confidence > 0"
                  :class="['confirm-confidence', getConfidenceClass(recognitionResult.patentName.confidence)]"
                >
                  {{ getConfidenceText(recognitionResult.patentName.confidence) }}
                </span>
              </div>
              <input
                v-model="patentName"
                type="text"
                placeholder="请输入专利名称"
                class="confirm-input"
              />
              <button
                v-if="recognitionResult.patentName.evidence"
                class="confirm-evidence-btn"
                @click="toggleEvidence('patentName')"
              >
                <Eye :size="14" />
                查看识别依据
                <ChevronDown v-if="!showEvidence.patentName" :size="14" />
                <ChevronUp v-else :size="14" />
              </button>
              <div v-if="showEvidence.patentName" class="confirm-evidence">
                <p><strong>识别来源：</strong>{{ recognitionResult.patentName.source }}</p>
                <p><strong>原文依据：</strong>{{ recognitionResult.patentName.evidence }}</p>
                <p><strong>置信度：</strong>{{ Math.round(recognitionResult.patentName.confidence * 100) }}%</p>
              </div>
            </div>

            <!-- 发明人 -->
            <div class="confirm-field">
              <div class="confirm-field-header">
                <label>发明人 *</label>
                <span
                  v-if="recognitionResult.inventors.confidence > 0"
                  :class="['confirm-confidence', getConfidenceClass(recognitionResult.inventors.confidence)]"
                >
                  {{ getConfidenceText(recognitionResult.inventors.confidence) }}
                </span>
              </div>
              <div class="confirm-inventors">
                <div v-for="(inventor, index) in inventors" :key="index" class="confirm-inventor-tag">
                  {{ inventor }}
                  <button @click="removeInventor(index)" class="confirm-inventor-remove">
                    <X :size="14" />
                  </button>
                </div>
                <div class="confirm-inventor-input-wrapper">
                  <input
                    v-model="newInventor"
                    type="text"
                    placeholder="输入发明人姓名"
                    class="confirm-inventor-input"
                    @keydown="handleInventorKeydown"
                  />
                  <button @click="addInventor" class="confirm-inventor-add">添加</button>
                </div>
              </div>
              <button
                v-if="recognitionResult.inventors.evidence"
                class="confirm-evidence-btn"
                @click="toggleEvidence('inventors')"
              >
                <Eye :size="14" />
                查看识别依据
                <ChevronDown v-if="!showEvidence.inventors" :size="14" />
                <ChevronUp v-else :size="14" />
              </button>
              <div v-if="showEvidence.inventors" class="confirm-evidence">
                <p><strong>识别来源：</strong>{{ recognitionResult.inventors.source }}</p>
                <p><strong>原文依据：</strong>{{ recognitionResult.inventors.evidence }}</p>
                <p><strong>置信度：</strong>{{ Math.round(recognitionResult.inventors.confidence * 100) }}%</p>
              </div>
            </div>

            <!-- 专利类型 -->
            <div class="confirm-field">
              <div class="confirm-field-header">
                <label>专利类型 *</label>
                <span
                  v-if="recognitionResult.patentType.confidence > 0"
                  :class="['confirm-confidence', getConfidenceClass(recognitionResult.patentType.confidence)]"
                >
                  {{ getConfidenceText(recognitionResult.patentType.confidence) }}
                </span>
              </div>
              <select v-model="patentType" class="confirm-select">
                <option v-for="option in patentTypeOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
              <button
                v-if="recognitionResult.patentType.evidence"
                class="confirm-evidence-btn"
                @click="toggleEvidence('patentType')"
              >
                <Eye :size="14" />
                查看识别依据
                <ChevronDown v-if="!showEvidence.patentType" :size="14" />
                <ChevronUp v-else :size="14" />
              </button>
              <div v-if="showEvidence.patentType" class="confirm-evidence">
                <p><strong>识别来源：</strong>{{ recognitionResult.patentType.source }}</p>
                <p><strong>原文依据：</strong>{{ recognitionResult.patentType.evidence }}</p>
                <p><strong>置信度：</strong>{{ Math.round(recognitionResult.patentType.confidence * 100) }}%</p>
              </div>
            </div>

            <!-- 专利号 -->
            <div class="confirm-field">
              <div class="confirm-field-header">
                <label>专利号 *</label>
                <span
                  v-if="recognitionResult.patentNumber.confidence > 0"
                  :class="['confirm-confidence', getConfidenceClass(recognitionResult.patentNumber.confidence)]"
                >
                  {{ getConfidenceText(recognitionResult.patentNumber.confidence) }}
                </span>
              </div>
              <div class="confirm-patent-number">
                <input
                  v-model="patentNumber"
                  type="text"
                  placeholder="请输入专利号"
                  class="confirm-input"
                />
                <select v-model="numberType" class="confirm-number-type-select">
                  <option v-for="option in numberTypeOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </div>
              <button
                v-if="recognitionResult.patentNumber.evidence"
                class="confirm-evidence-btn"
                @click="toggleEvidence('patentNumber')"
              >
                <Eye :size="14" />
                查看识别依据
                <ChevronDown v-if="!showEvidence.patentNumber" :size="14" />
                <ChevronUp v-else :size="14" />
              </button>
              <div v-if="showEvidence.patentNumber" class="confirm-evidence">
                <p><strong>识别来源：</strong>{{ recognitionResult.patentNumber.source }}</p>
                <p><strong>原文依据：</strong>{{ recognitionResult.patentNumber.evidence }}</p>
                <p><strong>置信度：</strong>{{ Math.round(recognitionResult.patentNumber.confidence * 100) }}%</p>
                <p v-if="recognitionResult.patentNumber.numberType">
                  <strong>编号类型：</strong>{{ recognitionResult.patentNumber.numberType }}
                </p>
              </div>
            </div>

            <!-- 重复专利警告 -->
            <div v-if="duplicateWarning" class="confirm-duplicate-warning">
              <AlertTriangle :size="18" />
              <div>
                <p>{{ duplicateWarning }}</p>
                <p class="confirm-duplicate-hint">请修改专利号后重试</p>
              </div>
            </div>

            <!-- 错误提示 -->
            <div v-if="error" class="confirm-error">
              <AlertTriangle :size="18" />
              <p>{{ error }}</p>
            </div>
          </div>

          <!-- 底部 -->
          <div class="confirm-footer">
            <button class="confirm-cancel-btn" @click="handleClose" :disabled="isSaving">
              取消
            </button>
            <button class="confirm-save-btn" @click="savePatent" :disabled="isSaving">
              <span v-if="isSaving">保存中...</span>
              <span v-else>确认保存</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 动画 */
.confirm-enter-active,
.confirm-leave-active {
  transition: all 0.3s ease;
}

.confirm-enter-from,
.confirm-leave-to {
  opacity: 0;
}

.confirm-enter-from .confirm-dialog,
.confirm-leave-to .confirm-dialog {
  transform: scale(0.95);
  opacity: 0;
}

/* 遮罩层 */
.confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

/* 弹窗 */
.confirm-dialog {
  background: var(--paper, #ffffff);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  width: 100%;
  max-width: 600px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: all 0.3s ease;
}

/* 头部 */
.confirm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--line, #dce5df);
  background: var(--soft, #eef4f0);
}

.confirm-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.confirm-title h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.confirm-title svg {
  color: var(--green, #1f7a5a);
}

.confirm-close {
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  color: var(--muted, #5f6f69);
  border-radius: 8px;
  transition: all 0.2s;
}

.confirm-close:hover:not(:disabled) {
  background: var(--line, #dce5df);
  color: var(--ink, #17211f);
}

/* 内容 */
.confirm-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

/* 提示 */
.confirm-notice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 8px;
  margin-bottom: 20px;
}

.confirm-notice svg {
  color: #d97706;
  flex-shrink: 0;
  margin-top: 2px;
}

.confirm-notice p {
  color: #92400e;
  font-size: 14px;
  margin: 0;
}

/* 字段 */
.confirm-field {
  margin-bottom: 20px;
}

.confirm-field-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.confirm-field-header label {
  font-weight: 600;
  color: var(--ink, #17211f);
}

/* 置信度 */
.confirm-confidence {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.confidence-high {
  background: #dcfce7;
  color: #166534;
}

.confidence-medium {
  background: #fef3c7;
  color: #92400e;
}

.confidence-low {
  background: #fee2e2;
  color: #991b1b;
}

/* 输入框 */
.confirm-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--line, #dce5df);
  border-radius: 8px;
  font-size: 14px;
  color: var(--ink, #17211f);
  background: #ffffff;
  transition: border-color 0.2s;
}

.confirm-input:focus {
  outline: none;
  border-color: var(--green, #1f7a5a);
}

/* 选择框 */
.confirm-select {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--line, #dce5df);
  border-radius: 8px;
  font-size: 14px;
  color: var(--ink, #17211f);
  background: #ffffff;
  cursor: pointer;
}

.confirm-select:focus {
  outline: none;
  border-color: var(--green, #1f7a5a);
}

/* 专利号 */
.confirm-patent-number {
  display: flex;
  gap: 10px;
}

.confirm-patent-number .confirm-input {
  flex: 1;
}

.confirm-number-type-select {
  width: 140px;
  padding: 10px 14px;
  border: 1px solid var(--line, #dce5df);
  border-radius: 8px;
  font-size: 14px;
  color: var(--ink, #17211f);
  background: #ffffff;
  cursor: pointer;
}

/* 发明人 */
.confirm-inventors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.confirm-inventor-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--soft, #eef4f0);
  border: 1px solid var(--line, #dce5df);
  border-radius: 20px;
  font-size: 14px;
}

.confirm-inventor-remove {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--muted, #5f6f69);
  display: flex;
}

.confirm-inventor-remove:hover {
  color: #dc2626;
}

.confirm-inventor-input-wrapper {
  display: flex;
  gap: 8px;
  width: 100%;
}

.confirm-inventor-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--line, #dce5df);
  border-radius: 8px;
  font-size: 14px;
}

.confirm-inventor-input:focus {
  outline: none;
  border-color: var(--green, #1f7a5a);
}

.confirm-inventor-add {
  padding: 8px 16px;
  background: var(--soft, #eef4f0);
  border: 1px solid var(--line, #dce5df);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--ink, #17211f);
  transition: all 0.2s;
}

.confirm-inventor-add:hover {
  background: var(--line, #dce5df);
}

/* 原文依据 */
.confirm-evidence-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: var(--green, #1f7a5a);
  margin-top: 8px;
}

.confirm-evidence-btn:hover {
  text-decoration: underline;
}

.confirm-evidence {
  margin-top: 10px;
  padding: 12px;
  background: var(--soft, #eef4f0);
  border-radius: 6px;
  font-size: 13px;
}

.confirm-evidence p {
  margin: 0 0 6px 0;
  color: var(--muted, #5f6f69);
}

.confirm-evidence strong {
  color: var(--ink, #17211f);
}

/* 重复警告 */
.confirm-duplicate-warning {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  margin-top: 20px;
}

.confirm-duplicate-warning svg {
  color: #dc2626;
  flex-shrink: 0;
  margin-top: 2px;
}

.confirm-duplicate-warning p {
  color: #991b1b;
  font-size: 14px;
  margin: 0 0 4px 0;
}

.confirm-duplicate-hint {
  font-size: 13px !important;
  color: #b91c1c !important;
  margin: 0 !important;
}

.confirm-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--ink, #17211f);
}

.confirm-checkbox input {
  cursor: pointer;
}

/* 错误提示 */
.confirm-error {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  margin-top: 20px;
}

.confirm-error svg {
  color: #dc2626;
  flex-shrink: 0;
  margin-top: 2px;
}

.confirm-error p {
  color: #991b1b;
  font-size: 14px;
  margin: 0;
}

/* 底部 */
.confirm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--line, #dce5df);
}

.confirm-cancel-btn {
  padding: 10px 24px;
  background: #ffffff;
  border: 1px solid var(--line, #dce5df);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: var(--ink, #17211f);
  transition: all 0.2s;
}

.confirm-cancel-btn:hover:not(:disabled) {
  background: var(--soft, #eef4f0);
}

.confirm-save-btn {
  padding: 10px 24px;
  background: var(--green, #1f7a5a);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: white;
  transition: background 0.2s;
}

.confirm-save-btn:hover:not(:disabled) {
  background: #166b4e;
}

.confirm-save-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

/* 响应式 */
@media (max-width: 768px) {
  .confirm-dialog {
    max-width: 100%;
    max-height: 90vh;
  }

  .confirm-patent-number {
    flex-direction: column;
  }

  .confirm-number-type-select {
    width: 100%;
  }
}
</style>
