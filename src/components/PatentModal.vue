<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { X, Download, Eye, ChevronLeft, ChevronRight, ArrowLeft, FileText, Upload, Trash2, ExternalLink } from 'lucide-vue-next'
import { memberApi, type Patent, type RecognizeResponse } from '../utils/api'
import PatentUploadDialog from './PatentUploadDialog.vue'
import PatentRecognitionConfirm from './PatentRecognitionConfirm.vue'

interface Props {
  visible: boolean
}

interface Emits {
  (e: 'close'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// 状态
const patents = ref<Patent[]>([])
const currentPage = ref(1)
const totalPages = ref(1)
const total = ref(0)
const pageSize = ref(10)
const isLoading = ref(false)
const error = ref('')

// 预览相关
const showPreview = ref(false)
const previewPatent = ref<Patent | null>(null)
const previewUrl = ref('')
const previewLoaded = ref(false)
const previewError = ref(false)

// 删除确认相关
const showDeleteConfirm = ref(false)
const deletingPatent = ref<Patent | null>(null)
const isDeleting = ref(false)
const deleteError = ref('')

// 上传相关
const showUploadDialog = ref(false)
const showConfirmDialog = ref(false)
const recognitionResult = ref<RecognizeResponse | null>(null)

// 监听visible变化，加载数据
watch(() => props.visible, (newVal) => {
  if (newVal) {
    fetchPatents()
    // 禁止背景滚动
    document.body.style.overflow = 'hidden'
  } else {
    // 恢复背景滚动
    document.body.style.overflow = ''
    // 重置预览状态
    showPreview.value = false
    previewPatent.value = null
    previewUrl.value = ''
    previewLoaded.value = false
    previewError.value = false
  }
})

// 键盘ESC关闭
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.visible) {
    handleClose()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})

// 获取专利列表
async function fetchPatents() {
  isLoading.value = true
  error.value = ''

  try {
    const result = await memberApi.listPatents(currentPage.value, pageSize.value)
    patents.value = result.data
    totalPages.value = result.pagination.totalPages
    total.value = result.pagination.total
  } catch (err) {
    error.value = '加载专利列表失败，请稍后重试'
    console.error('Failed to fetch patents:', err)
  } finally {
    isLoading.value = false
  }
}

// 翻页
function handlePageChange(page: number) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
  fetchPatents()
}

// 预览专利 - 内置窗口
function handlePreview(patent: Patent) {
  previewPatent.value = patent
  previewUrl.value = memberApi.getPatentPreviewUrl(patent.id)
  previewLoaded.value = false
  previewError.value = false
  showPreview.value = true

  // 10秒超时显示错误状态
  setTimeout(() => {
    if (!previewLoaded.value && showPreview.value) {
      previewError.value = true
    }
  }, 10000)
}

// 下载专利
function handleDownload(patent: Patent) {
  const url = memberApi.getPatentDownloadUrl(patent.id)
  const link = document.createElement('a')
  link.href = url
  link.download = `${patent.title}.pdf`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// 删除专利 - 显示确认对话框
function handleDelete(patent: Patent) {
  deletingPatent.value = patent
  deleteError.value = ''
  showDeleteConfirm.value = true
}

// 确认删除
async function confirmDelete() {
  if (!deletingPatent.value) return

  isDeleting.value = true
  deleteError.value = ''

  try {
    await memberApi.deletePatent(deletingPatent.value.id)
    showDeleteConfirm.value = false
    deletingPatent.value = null
    // 刷新列表
    fetchPatents()
  } catch (err: any) {
    deleteError.value = err.message || '删除失败，请重试'
  } finally {
    isDeleting.value = false
  }
}

// 取消删除
function cancelDelete() {
  showDeleteConfirm.value = false
  deletingPatent.value = null
  deleteError.value = ''
}

// 返回列表
function handleBackToList() {
  showPreview.value = false
  previewPatent.value = null
  previewUrl.value = ''
  previewLoaded.value = false
  previewError.value = false
}

// 关闭弹窗
function handleClose() {
  emit('close')
}

// 格式化发明人列表
function formatInventors(inventors: string[]): string {
  return inventors.join('、')
}

// 获取专利类型样式类
function getPatentTypeClass(type: string): string {
  switch (type) {
    case '发明':
      return 'patent-type-invention'
    case '实用新型':
      return 'patent-type-utility'
    case '外观设计':
      return 'patent-type-design'
    default:
      return ''
  }
}

// 处理识别完成
function handleRecognized(result: RecognizeResponse) {
  console.log('handleRecognized called with:', result)
  showUploadDialog.value = false
  recognitionResult.value = result
  showConfirmDialog.value = true
  console.log('showConfirmDialog:', showConfirmDialog.value)
  console.log('recognitionResult:', recognitionResult.value)
}

// 处理专利保存成功
function handlePatentSaved(patentId: string) {
  showConfirmDialog.value = false
  recognitionResult.value = null
  // 刷新专利列表
  fetchPatents()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="patent-modal-overlay" @click.self="handleClose">
        <div class="patent-modal-container">
          <!-- 头部 -->
          <div class="patent-modal-header">
            <div class="patent-modal-title">
              <FileText :size="24" />
              <h2>{{ showPreview ? '专利预览' : '专利列表' }}</h2>
              <span v-if="!showPreview" class="patent-count">共 {{ total }} 项</span>
            </div>
            <div class="patent-modal-actions">
              <button
                v-if="!showPreview"
                class="patent-upload-btn"
                @click="showUploadDialog = true"
              >
                <Upload :size="18" />
                <span>上传专利</span>
              </button>
              <button class="patent-modal-close" @click="handleClose" aria-label="关闭">
                <X :size="20" />
              </button>
            </div>
          </div>

          <!-- 内容区域 -->
          <div class="patent-modal-body">
            <!-- 加载状态 -->
            <div v-if="isLoading" class="patent-loading">
              <div class="patent-spinner"></div>
              <p>加载中...</p>
            </div>

            <!-- 错误提示 -->
            <div v-else-if="error" class="patent-error">
              <p>{{ error }}</p>
              <button @click="fetchPatents">重试</button>
            </div>

            <!-- 列表视图 -->
            <div v-else-if="!showPreview" class="patent-list-view">
              <!-- 空状态 -->
              <div v-if="patents.length === 0" class="patent-empty">
                <FileText :size="48" />
                <p>暂无专利数据</p>
              </div>

              <!-- 专利表格 -->
              <div v-else class="patent-table-wrapper">
                <table class="patent-table">
                  <thead>
                    <tr>
                      <th class="patent-col-title">专利名称</th>
                      <th class="patent-col-number">专利号</th>
                      <th class="patent-col-inventors">发明人</th>
                      <th class="patent-col-type">专利类型</th>
                      <th class="patent-col-actions">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="patent in patents" :key="patent.id">
                      <td class="patent-col-title">
                        <div class="patent-title-cell">
                          <FileText :size="16" />
                          <span>{{ patent.title }}</span>
                        </div>
                      </td>
                      <td class="patent-col-number">
                        <code>{{ patent.patent_number }}</code>
                      </td>
                      <td class="patent-col-inventors">
                        {{ formatInventors(patent.inventors) }}
                      </td>
                      <td class="patent-col-type">
                        <span :class="['patent-type-badge', getPatentTypeClass(patent.patent_type)]">
                          {{ patent.patent_type }}
                        </span>
                      </td>
                      <td class="patent-col-actions">
                        <div class="patent-actions">
                          <button
                            class="patent-btn patent-btn-preview"
                            @click="handlePreview(patent)"
                            title="预览"
                          >
                            <Eye :size="16" />
                            <span>预览</span>
                          </button>
                          <button
                            class="patent-btn patent-btn-download"
                            @click="handleDownload(patent)"
                            title="下载"
                          >
                            <Download :size="16" />
                            <span>下载</span>
                          </button>
                          <button
                            class="patent-btn patent-btn-delete"
                            @click="handleDelete(patent)"
                            title="删除"
                          >
                            <Trash2 :size="16" />
                            <span>删除</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- 分页 -->
              <div v-if="totalPages > 1" class="patent-pagination">
                <button
                  class="patent-page-btn"
                  :disabled="currentPage <= 1"
                  @click="handlePageChange(currentPage - 1)"
                >
                  <ChevronLeft :size="18" />
                  <span>上一页</span>
                </button>
                <div class="patent-page-info">
                  <span class="patent-page-current">{{ currentPage }}</span>
                  <span class="patent-page-separator">/</span>
                  <span class="patent-page-total">{{ totalPages }}</span>
                </div>
                <button
                  class="patent-page-btn"
                  :disabled="currentPage >= totalPages"
                  @click="handlePageChange(currentPage + 1)"
                >
                  <span>下一页</span>
                  <ChevronRight :size="18" />
                </button>
              </div>
            </div>

            <!-- 预览视图 -->
            <div v-else class="patent-preview-view">
              <div class="patent-preview-toolbar">
                <button class="patent-back-btn" @click="handleBackToList">
                  <ArrowLeft :size="18" />
                  <span>返回列表</span>
                </button>
                <div class="patent-preview-info">
                  <span class="patent-preview-title">{{ previewPatent?.title }}</span>
                  <span class="patent-preview-number">{{ previewPatent?.patent_number }}</span>
                </div>
                <div class="patent-preview-actions">
                  <button
                    class="patent-btn patent-btn-download"
                    @click="previewPatent && handleDownload(previewPatent)"
                  >
                    <Download :size="16" />
                    <span>下载</span>
                  </button>
                  <a
                    v-if="previewUrl"
                    :href="previewUrl"
                    target="_blank"
                    class="patent-btn patent-btn-open"
                  >
                    <ExternalLink :size="16" />
                    <span>新窗口打开</span>
                  </a>
                </div>
              </div>
              <div class="patent-preview-content">
                <iframe
                  v-if="previewUrl"
                  :src="previewUrl"
                  class="patent-preview-iframe"
                  @load="previewLoaded = true"
                  @error="previewError = true"
                ></iframe>
                <div v-if="!previewLoaded && !previewError" class="patent-preview-loading">
                  <div class="loading-spinner"></div>
                  <span>正在加载预览...</span>
                </div>
                <div v-if="previewError" class="patent-preview-error">
                  <p>PDF 预览加载失败</p>
                  <a :href="previewUrl" target="_blank" class="patent-btn patent-btn-primary">
                    点击在新窗口打开
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 上传弹窗 -->
    <PatentUploadDialog
      :visible="showUploadDialog"
      @close="showUploadDialog = false"
      @recognized="handleRecognized"
    />

    <!-- 确认弹窗 -->
    <PatentRecognitionConfirm
      :visible="showConfirmDialog"
      :recognition-result="recognitionResult"
      @close="showConfirmDialog = false"
      @saved="handlePatentSaved"
    />

    <!-- 删除确认对话框 -->
    <Transition name="modal">
      <div v-if="showDeleteConfirm" class="confirm-overlay" @click.self="cancelDelete">
        <div class="confirm-dialog">
          <div class="confirm-header">
            <div class="confirm-icon">
              <Trash2 :size="24" />
            </div>
            <h3>确认删除</h3>
          </div>
          <div class="confirm-body">
            <p class="confirm-message">
              确定要删除专利 <strong>"{{ deletingPatent?.title }}"</strong> 吗？
            </p>
            <p class="confirm-warning">此操作不可恢复，删除后将无法找回。</p>
            <p v-if="deleteError" class="confirm-error">{{ deleteError }}</p>
          </div>
          <div class="confirm-actions">
            <button class="confirm-btn confirm-btn-cancel" @click="cancelDelete" :disabled="isDeleting">
              取消
            </button>
            <button class="confirm-btn confirm-btn-delete" @click="confirmDelete" :disabled="isDeleting">
              <span v-if="isDeleting">删除中...</span>
              <span v-else>确认删除</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 模态框动画 */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .patent-modal-container,
.modal-leave-to .patent-modal-container {
  transform: scale(0.9);
  opacity: 0;
}

/* 遮罩层 */
.patent-modal-overlay {
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

/* 弹窗容器 */
.patent-modal-container {
  background: var(--paper, #ffffff);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  width: 80%;
  max-width: 1200px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: all 0.3s ease;
}

/* 头部 */
.patent-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--line, #dce5df);
  background: var(--soft, #eef4f0);
}

.patent-modal-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.patent-modal-title h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--ink, #17211f);
}

.patent-modal-title svg {
  color: var(--green, #1f7a5a);
}

.patent-count {
  font-size: 14px;
  color: var(--muted, #5f6f69);
  background: var(--paper, #ffffff);
  padding: 4px 12px;
  border-radius: 20px;
  border: 1px solid var(--line, #dce5df);
}

/* 头部操作区 */
.patent-modal-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 上传按钮 */
.patent-upload-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--green, #1f7a5a);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
}

.patent-upload-btn:hover {
  background: #166b4e;
}

.patent-modal-close {
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

.patent-modal-close:hover {
  background: var(--line, #dce5df);
  color: var(--ink, #17211f);
}

/* 内容区域 */
.patent-modal-body {
  flex: 1;
  overflow: auto;
  padding: 24px;
}

/* 加载状态 */
.patent-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--muted, #5f6f69);
}

.patent-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--line, #dce5df);
  border-top-color: var(--green, #1f7a5a);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 错误状态 */
.patent-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--ink, #17211f);
}

.patent-error p {
  margin-bottom: 16px;
}

.patent-error button {
  padding: 8px 24px;
  background: var(--green, #1f7a5a);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.patent-error button:hover {
  background: #166b4e;
}

/* 空状态 */
.patent-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--muted, #5f6f69);
}

.patent-empty svg {
  margin-bottom: 16px;
  opacity: 0.5;
}

.patent-empty p {
  font-size: 16px;
}

/* 表格 */
.patent-table-wrapper {
  overflow-x: auto;
}

.patent-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.patent-table th {
  background: var(--soft, #eef4f0);
  padding: 14px 16px;
  text-align: left;
  font-weight: 600;
  color: var(--ink, #17211f);
  border-bottom: 2px solid var(--line, #dce5df);
  white-space: nowrap;
}

.patent-table td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--line, #dce5df);
  color: var(--ink, #17211f);
}

.patent-table tbody tr {
  transition: background 0.2s;
}

.patent-table tbody tr:hover {
  background: var(--soft, #eef4f0);
}

/* 列宽 */
.patent-col-title {
  min-width: 200px;
}

.patent-col-number {
  min-width: 150px;
}

.patent-col-inventors {
  min-width: 150px;
}

.patent-col-type {
  min-width: 100px;
}

.patent-col-actions {
  min-width: 240px;
}

/* 标题单元格 */
.patent-title-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.patent-title-cell svg {
  color: var(--green, #1f7a5a);
  flex-shrink: 0;
}

.patent-title-cell span {
  font-weight: 500;
}

/* 专利号 */
.patent-table code {
  background: var(--soft, #eef4f0);
  padding: 4px 8px;
  border-radius: 4px;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 13px;
  color: var(--teal, #087c89);
}

/* 专利类型徽章 */
.patent-type-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.patent-type-invention {
  background: #e3f2fd;
  color: #1565c0;
}

.patent-type-utility {
  background: #e8f5e9;
  color: #2e7d32;
}

.patent-type-design {
  background: #fff3e0;
  color: #ef6c00;
}

/* 操作按钮 */
.patent-actions {
  display: flex;
  gap: 8px;
  white-space: nowrap;
}

.patent-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
  white-space: nowrap;
  flex-shrink: 0;
}

.patent-btn-preview {
  background: var(--soft, #eef4f0);
  color: var(--ink, #17211f);
  border: 1px solid var(--line, #dce5df);
}

.patent-btn-preview:hover {
  background: var(--line, #dce5df);
}

.patent-btn-download {
  background: var(--green, #1f7a5a);
  color: white;
}

.patent-btn-download:hover {
  background: #166b4e;
}

.patent-btn-delete {
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fecaca;
}

.patent-btn-delete:hover {
  background: #fecaca;
  color: #991b1b;
}

/* 分页 */
.patent-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--line, #dce5df);
}

.patent-page-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: var(--paper, #ffffff);
  border: 1px solid var(--line, #dce5df);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--ink, #17211f);
  transition: all 0.2s;
}

.patent-page-btn:hover:not(:disabled) {
  background: var(--soft, #eef4f0);
  border-color: var(--green, #1f7a5a);
  color: var(--green, #1f7a5a);
}

.patent-page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.patent-page-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--muted, #5f6f69);
}

.patent-page-current {
  font-weight: 600;
  color: var(--ink, #17211f);
}

/* 预览视图 */
.patent-preview-view {
  display: flex;
  flex-direction: column;
  height: calc(85vh - 120px);
}

.patent-preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 0;
  border-bottom: 1px solid var(--line, #dce5df);
  margin-bottom: 16px;
}

.patent-back-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: var(--soft, #eef4f0);
  border: 1px solid var(--line, #dce5df);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--ink, #17211f);
  transition: all 0.2s;
}

.patent-back-btn:hover {
  background: var(--line, #dce5df);
}

.patent-preview-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.patent-preview-title {
  font-weight: 600;
  color: var(--ink, #17211f);
}

.patent-preview-number {
  font-size: 13px;
  color: var(--muted, #5f6f69);
}

.patent-preview-content {
  flex: 1;
  border: 1px solid var(--line, #dce5df);
  border-radius: 8px;
  overflow: hidden;
}

.patent-preview-iframe {
  width: 100%;
  height: 100%;
  border: none;
}

.patent-preview-actions {
  display: flex;
  gap: 8px;
}

.patent-btn-open {
  background: var(--accent, #2d5a3d);
  color: white;
  text-decoration: none;
}

.patent-btn-open:hover {
  background: var(--accent-hover, #1e4a2e);
}

.patent-preview-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
  color: var(--muted, #5f6f69);
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--line, #dce5df);
  border-top-color: var(--accent, #2d5a3d);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.patent-preview-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
  color: var(--muted, #5f6f69);
}

.patent-preview-error p {
  font-size: 16px;
}

.patent-btn-primary {
  background: var(--accent, #2d5a3d);
  color: white;
  text-decoration: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
}

.patent-btn-primary:hover {
  background: var(--accent-hover, #1e4a2e);
}

/* 删除确认对话框 */
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
  z-index: 1100;
  padding: 20px;
}

.confirm-dialog {
  background: white;
  border-radius: 16px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.confirm-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 28px 24px 20px;
  background: linear-gradient(135deg, #fff5f5 0%, #ffe8e8 100%);
}

.confirm-icon {
  width: 56px;
  height: 56px;
  background: #fee2e2;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #dc2626;
}

.confirm-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--ink, #17211f);
}

.confirm-body {
  padding: 20px 24px;
}

.confirm-message {
  margin: 0 0 12px;
  font-size: 15px;
  color: var(--ink, #17211f);
  line-height: 1.5;
}

.confirm-message strong {
  color: #dc2626;
}

.confirm-warning {
  margin: 0;
  font-size: 13px;
  color: var(--muted, #5f6f69);
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
  border-left: 3px solid #fbbf24;
}

.confirm-error {
  margin: 12px 0 0;
  font-size: 13px;
  color: #dc2626;
  padding: 10px 12px;
  background: #fef2f2;
  border-radius: 8px;
}

.confirm-actions {
  display: flex;
  gap: 12px;
  padding: 16px 24px 24px;
}

.confirm-btn {
  flex: 1;
  padding: 12px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.confirm-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.confirm-btn-cancel {
  background: var(--soft, #eef4f0);
  color: var(--ink, #17211f);
  border: 1px solid var(--line, #dce5df);
}

.confirm-btn-cancel:hover:not(:disabled) {
  background: var(--line, #dce5df);
}

.confirm-btn-delete {
  background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
  color: white;
}

.confirm-btn-delete:hover:not(:disabled) {
  background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
}

/* 响应式 */
@media (max-width: 768px) {
  .patent-modal-container {
    width: 95%;
    max-height: 90vh;
  }

  .patent-modal-header {
    padding: 16px;
  }

  .patent-modal-body {
    padding: 16px;
  }

  .patent-table th,
  .patent-table td {
    padding: 12px;
  }

  .patent-col-inventors {
    display: none;
  }

  .patent-actions {
    flex-wrap: wrap;
    gap: 6px;
  }

  .patent-btn {
    padding: 6px 12px;
    font-size: 12px;
  }

  .patent-pagination {
    flex-direction: column;
    gap: 12px;
  }

  .patent-preview-toolbar {
    flex-direction: column;
    gap: 12px;
  }
}
</style>
