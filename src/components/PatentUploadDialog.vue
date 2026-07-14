<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Upload, X as XIcon, FileText, Loader2, AlertCircle, StopCircle } from 'lucide-vue-next'
import { memberApi, type RecognizeResponse } from '../utils/api'

interface Props {
  visible: boolean
}

interface Emits {
  (e: 'close'): void
  (e: 'recognized', result: RecognizeResponse): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// 状态
const isDragging = ref(false)
const isUploading = ref(false)
const uploadProgress = ref('')
const error = ref('')
const selectedFile = ref<File | null>(null)

// 中止控制器
let abortController: AbortController | null = null
const currentRecognitionId = ref<string | null>(null)

// 进度阶段
const progressStages = [
  '正在上传文件',
  '正在读取 PDF',
  '正在识别专利信息',
  '正在校验识别结果',
]
const currentStage = ref(0)

// 监听visible变化，重置状态
watch(() => props.visible, (newVal) => {
  if (!newVal) {
    resetState()
  }
})

// 重置状态
function resetState() {
  if (isUploading.value) {
    handleAbort()
  }
  selectedFile.value = null
  error.value = ''
  isUploading.value = false
  uploadProgress.value = ''
  currentStage.value = 0
  currentRecognitionId.value = null
}

// 文件大小格式化
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// 拖拽处理
function handleDragOver(e: DragEvent) {
  e.preventDefault()
  isDragging.value = true
}

function handleDragLeave() {
  isDragging.value = false
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false

  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    handleFileSelect(files[0])
  }
}

// 文件选择
function handleFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    handleFileSelect(input.files[0])
    input.value = ''
  }
}

// 处理文件选择
function handleFileSelect(file: File) {
  error.value = ''

  // 验证文件类型
  if (file.type !== 'application/pdf') {
    error.value = '请选择 PDF 格式的文件'
    return
  }

  // 验证文件大小（30MB）
  if (file.size > 30 * 1024 * 1024) {
    error.value = '文件大小超过限制（最大 30MB）'
    return
  }

  selectedFile.value = file
}

// 开始识别
async function startRecognition() {
  if (!selectedFile.value) return

  isUploading.value = true
  error.value = ''
  currentStage.value = 0

  // 创建中止控制器
  abortController = new AbortController()

  // 模拟进度更新
  const progressInterval = setInterval(() => {
    if (currentStage.value < progressStages.length - 1) {
      currentStage.value++
      uploadProgress.value = progressStages[currentStage.value]
    }
  }, 800)

  try {
    uploadProgress.value = progressStages[0]

    console.log('Starting recognition...')
    const result = await memberApi.recognizePatent(selectedFile.value, abortController.signal)
    console.log('Recognition completed:', result)

    clearInterval(progressInterval)

    // 保存识别ID，以便中止时删除
    currentRecognitionId.value = result.recognitionId

    isUploading.value = false

    // 触发识别完成事件
    console.log('Emitting recognized event...')
    emit('recognized', result)
    console.log('Recognized event emitted')
  } catch (err: any) {
    clearInterval(progressInterval)
    isUploading.value = false

    console.error('Recognition error:', err)

    // 检查是否是中止错误
    if (err.name === 'AbortError' || err.message?.includes('aborted')) {
      // 中止已经在handleAbort中处理，这里不需要额外操作
      return
    } else {
      error.value = err.message || '识别失败，请重试'
    }
  }
}

// 中止识别
function handleAbort() {
  // 立即中止请求
  if (abortController) {
    abortController.abort()
    abortController = null
  }

  // 立即更新UI状态
  isUploading.value = false
  uploadProgress.value = ''
  currentStage.value = 0
  error.value = '识别已中止'

  // 异步清理文件（不等待完成）
  if (currentRecognitionId.value) {
    const recognitionId = currentRecognitionId.value
    currentRecognitionId.value = null
    // 异步调用，不阻塞UI
    memberApi.cancelRecognition(recognitionId).catch(err => {
      console.error('Failed to cleanup uploaded file:', err)
    })
  }
}

// 关闭弹窗
function handleClose() {
  if (!isUploading.value) {
    emit('close')
  }
}

// 清除选择
function clearSelection() {
  selectedFile.value = null
  error.value = ''
}
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="visible" class="upload-dialog-overlay" @click.self="handleClose">
        <div class="upload-dialog">
          <!-- 头部 -->
          <div class="upload-dialog-header">
            <div class="upload-dialog-title">
              <FileText :size="24" />
              <h2>上传专利 PDF</h2>
            </div>
            <button
              class="upload-dialog-close"
              @click="handleClose"
              :disabled="isUploading"
              aria-label="关闭"
            >
              <XIcon :size="20" />
            </button>
          </div>

          <!-- 内容 -->
          <div class="upload-dialog-body">
            <!-- 上传区域 -->
            <div
              v-if="!selectedFile"
              class="upload-dropzone"
              :class="{ 'is-dragging': isDragging }"
              @dragover="handleDragOver"
              @dragleave="handleDragLeave"
              @drop="handleDrop"
            >
              <Upload :size="48" />
              <p class="upload-dropzone-text">拖拽 PDF 文件到此处</p>
              <p class="upload-dropzone-hint">或</p>
              <label class="upload-select-btn">
                选择文件
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  @change="handleFileInput"
                  hidden
                />
              </label>
              <p class="upload-dropzone-limit">支持 PDF 格式，最大 30MB</p>
            </div>

            <!-- 已选文件 -->
            <div v-else class="upload-selected">
              <div class="upload-file-info">
                <FileText :size="32" />
                <div class="upload-file-details">
                  <p class="upload-file-name">{{ selectedFile.name }}</p>
                  <p class="upload-file-size">{{ formatFileSize(selectedFile.size) }}</p>
                </div>
                <button
                  v-if="!isUploading"
                  class="upload-clear-btn"
                  @click="clearSelection"
                >
                  <XIcon :size="18" />
                </button>
              </div>

              <!-- 识别进度 -->
              <div v-if="isUploading" class="upload-progress">
                <Loader2 :size="24" class="upload-spinner" />
                <div class="upload-progress-info">
                  <p class="upload-progress-text">{{ uploadProgress }}</p>
                  <div class="upload-progress-bar">
                    <div
                      class="upload-progress-fill"
                      :style="{ width: ((currentStage + 1) / progressStages.length * 100) + '%' }"
                    ></div>
                  </div>
                </div>
              </div>

              <!-- 操作按钮 -->
              <div class="upload-actions">
                <button
                  v-if="!isUploading"
                  class="upload-start-btn"
                  @click="startRecognition"
                >
                  开始识别
                </button>
                <button
                  v-else
                  class="upload-abort-btn"
                  @click="handleAbort"
                >
                  <StopCircle :size="18" />
                  <span>中止识别</span>
                </button>
              </div>
            </div>

            <!-- 错误提示 -->
            <div v-if="error" class="upload-error">
              <AlertCircle :size="18" />
              <p>{{ error }}</p>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 动画 */
.dialog-enter-active,
.dialog-leave-active {
  transition: all 0.3s ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-from .upload-dialog,
.dialog-leave-to .upload-dialog {
  transform: scale(0.95);
  opacity: 0;
}

/* 遮罩层 */
.upload-dialog-overlay {
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
.upload-dialog {
  background: var(--paper, #ffffff);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  width: 100%;
  max-width: 500px;
  overflow: hidden;
  transition: all 0.3s ease;
}

/* 头部 */
.upload-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--line, #dce5df);
  background: var(--soft, #eef4f0);
}

.upload-dialog-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.upload-dialog-title h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.upload-dialog-title svg {
  color: var(--green, #1f7a5a);
}

.upload-dialog-close {
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  color: var(--muted, #5f6f69);
  border-radius: 8px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.upload-dialog-close:hover:not(:disabled) {
  background: var(--line, #dce5df);
  color: var(--ink, #17211f);
}

.upload-dialog-close:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 内容 */
.upload-dialog-body {
  padding: 24px;
}

/* 拖拽区域 */
.upload-dropzone {
  border: 2px dashed var(--line, #dce5df);
  border-radius: 12px;
  padding: 40px 20px;
  text-align: center;
  transition: all 0.2s;
  cursor: pointer;
}

.upload-dropzone:hover,
.upload-dropzone.is-dragging {
  border-color: var(--green, #1f7a5a);
  background: var(--soft, #eef4f0);
}

.upload-dropzone svg {
  color: var(--muted, #5f6f69);
  margin-bottom: 16px;
}

.upload-dropzone-text {
  font-size: 16px;
  font-weight: 500;
  color: var(--ink, #17211f);
  margin-bottom: 8px;
}

.upload-dropzone-hint {
  color: var(--muted, #5f6f69);
  margin-bottom: 16px;
}

.upload-select-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 24px;
  background: var(--green, #1f7a5a);
  color: white;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s;
}

.upload-select-btn:hover {
  background: #166b4e;
}

.upload-dropzone-limit {
  margin-top: 16px;
  font-size: 13px;
  color: var(--muted, #5f6f69);
}

/* 已选文件 */
.upload-selected {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.upload-file-info {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--soft, #eef4f0);
  border-radius: 8px;
}

.upload-file-info svg:first-child {
  color: var(--green, #1f7a5a);
  flex-shrink: 0;
}

.upload-file-details {
  flex: 1;
  min-width: 0;
}

.upload-file-name {
  font-weight: 500;
  color: var(--ink, #17211f);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-file-size {
  font-size: 13px;
  color: var(--muted, #5f6f69);
  margin-top: 4px;
}

.upload-clear-btn {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: var(--muted, #5f6f69);
  border-radius: 4px;
  transition: all 0.2s;
}

.upload-clear-btn:hover {
  background: var(--line, #dce5df);
  color: var(--ink, #17211f);
}

/* 进度 */
.upload-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--soft, #eef4f0);
  border-radius: 8px;
}

.upload-spinner {
  color: var(--green, #1f7a5a);
  animation: spin 1s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.upload-progress-info {
  flex: 1;
}

.upload-progress-text {
  color: var(--ink, #17211f);
  font-weight: 500;
  margin-bottom: 8px;
}

.upload-progress-bar {
  height: 4px;
  background: var(--line, #dce5df);
  border-radius: 2px;
  overflow: hidden;
}

.upload-progress-fill {
  height: 100%;
  background: var(--green, #1f7a5a);
  border-radius: 2px;
  transition: width 0.3s ease;
}

/* 操作按钮 */
.upload-actions {
  display: flex;
  gap: 12px;
}

.upload-start-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 20px;
  background: var(--green, #1f7a5a);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
  margin: 0 auto;
}

.upload-start-btn:hover {
  background: #166b4e;
}

.upload-abort-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  background: #dc2626;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.2s;
  margin: 0 auto;
}

.upload-abort-btn:hover {
  background: #b91c1c;
}

/* 错误提示 */
.upload-error {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  margin-top: 16px;
}

.upload-error svg {
  color: #dc2626;
  flex-shrink: 0;
}

.upload-error p {
  color: #dc2626;
  font-size: 14px;
  margin: 0;
}

/* 响应式 */
@media (max-width: 768px) {
  .upload-dialog {
    max-width: 100%;
    margin: 10px;
  }

  .upload-dropzone {
    padding: 30px 15px;
  }
}
</style>
