<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Upload, X, ImageIcon } from 'lucide-vue-next'
import { resolvePhotoUrl } from '../utils/publicAsset'

interface Props {
  modelValue?: string
  memberId: string
  memberName: string
}

interface Emits {
  (e: 'update:modelValue', value: string): void
  (e: 'upload-success', photo: string): void
  (e: 'upload-error', error: string): void
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
})
const emit = defineEmits<Emits>()

const isDragging = ref(false)
const isUploading = ref(false)
const uploadProgress = ref(0)
const errorMessage = ref('')
const previewUrl = ref(props.modelValue)

watch(() => props.modelValue, (newVal) => {
  previewUrl.value = newVal ?? ''
})

const hasPhoto = computed(() => !!previewUrl.value)

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
    handleFile(files[0])
  }
}

function handleFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    handleFile(input.files[0])
    input.value = ''
  }
}

async function handleFile(file: File) {
  // 验证文件类型
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    errorMessage.value = '请上传 jpg、png 或 webp 格式的图片'
    emit('upload-error', errorMessage.value)
    return
  }

  // 验证文件大小（5MB）
  if (file.size > 5 * 1024 * 1024) {
    errorMessage.value = '文件大小超过限制（最大 5MB）'
    emit('upload-error', errorMessage.value)
    return
  }

  errorMessage.value = ''
  isUploading.value = true
  uploadProgress.value = 0

  try {
    // 模拟进度
    const progressInterval = setInterval(() => {
      if (uploadProgress.value < 90) {
        uploadProgress.value += 10
      }
    }, 100)

    const { memberApi } = await import('../utils/api')
    const result = await memberApi.uploadPhoto(props.memberId, file)

    clearInterval(progressInterval)
    uploadProgress.value = 100

    previewUrl.value = result.photo
    emit('update:modelValue', result.photo)
    emit('upload-success', result.photo)

    setTimeout(() => {
      uploadProgress.value = 0
    }, 1000)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '上传失败'
    emit('upload-error', errorMessage.value)
  } finally {
    isUploading.value = false
  }
}

function removePhoto() {
  previewUrl.value = ''
  emit('update:modelValue', '')
}

function getInitials(name: string) {
  return name.replace(/\d{4}届/g, '').replace(/\s+/g, '').slice(0, 2).toUpperCase()
}
</script>

<template>
  <div class="photo-uploader">
    <div
      class="upload-area"
      :class="{ dragging: isDragging, 'has-photo': hasPhoto }"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <div v-if="hasPhoto" class="photo-preview">
        <img :src="resolvePhotoUrl(previewUrl)" :alt="memberName" />
        <button
          type="button"
          class="remove-btn"
          :disabled="isUploading"
          @click="removePhoto"
        >
          <X :size="16" />
        </button>
      </div>
      <div v-else class="upload-placeholder">
        <div class="initials-avatar">
          {{ getInitials(memberName) }}
        </div>
        <div class="upload-hint">
          <Upload :size="20" />
          <span>点击或拖拽上传照片</span>
          <span class="upload-spec">支持 jpg、png、webp，最大 5MB</span>
        </div>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          :disabled="isUploading"
          @change="handleFileInput"
        />
      </div>
    </div>

    <div v-if="isUploading" class="upload-progress">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${uploadProgress}%` }"></div>
      </div>
      <span class="progress-text">上传中... {{ uploadProgress }}%</span>
    </div>

    <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
  </div>
</template>

<style scoped>
.photo-uploader {
  width: 100%;
}

.upload-area {
  position: relative;
  border: 2px dashed var(--line);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.2s ease;
  cursor: pointer;
}

.upload-area:hover {
  border-color: var(--green);
}

.upload-area.dragging {
  border-color: var(--green);
  background: rgba(16, 185, 129, 0.05);
}

.upload-area.has-photo {
  border-style: solid;
  border-color: var(--line);
}

.photo-preview {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
}

.photo-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.remove-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.photo-preview:hover .remove-btn {
  opacity: 1;
}

.remove-btn:hover {
  background: rgba(0, 0, 0, 0.8);
}

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  min-height: 160px;
}

.upload-placeholder input[type="file"] {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.initials-avatar {
  width: 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #10201c, #087c89 54%, #b7791f);
  color: white;
  font-size: 22px;
  font-weight: 800;
  border-radius: 10px;
  margin-bottom: 12px;
}

.upload-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: var(--muted);
  font-size: 14px;
}

.upload-spec {
  font-size: 12px;
  opacity: 0.7;
}

.upload-progress {
  margin-top: 8px;
}

.progress-bar {
  height: 4px;
  background: var(--line);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--green);
  transition: width 0.2s ease;
}

.progress-text {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--muted);
  text-align: center;
}

.error-message {
  margin-top: 8px;
  font-size: 13px;
  color: #a63f3f;
}
</style>
