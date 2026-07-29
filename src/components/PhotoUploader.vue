<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Upload, X, ImageIcon } from 'lucide-vue-next'
import { resolvePhotoUrl } from '../utils/publicAsset'
import ImageCropper from './ImageCropper.vue'

interface Props {
  modelValue?: string
  memberId: string
  memberName: string
  mode?: 'avatar' | 'cover'
}

interface Emits {
  (e: 'update:modelValue', value: string): void
  (e: 'upload-success', photo: string): void
  (e: 'upload-error', error: string): void
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  mode: 'avatar',
})
const emit = defineEmits<Emits>()

const isDragging = ref(false)
const isUploading = ref(false)
const uploadProgress = ref(0)
const errorMessage = ref('')
const previewUrl = ref(props.modelValue)

// 裁剪相关
const showCropper = ref(false)
const cropperFile = ref<File | null>(null)

const aspectRatio = computed(() => props.mode === 'cover' ? 9 / 16 : 5 / 7)
const outputWidth = computed(() => props.mode === 'cover' ? 540 : 500)
const outputHeight = computed(() => props.mode === 'cover' ? 960 : 700)

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
    prepareFile(files[0])
  }
}

function handleFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    prepareFile(input.files[0])
    input.value = ''
  }
}

function prepareFile(file: File) {
  // 验证文件类型
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    errorMessage.value = '请上传 jpg、png 或 webp 格式的图片'
    emit('upload-error', errorMessage.value)
    return
  }

  // 验证文件大小（10MB，裁剪前允许更大）
  if (file.size > 10 * 1024 * 1024) {
    errorMessage.value = '文件大小超过限制（最大 10MB）'
    emit('upload-error', errorMessage.value)
    return
  }

  errorMessage.value = ''
  cropperFile.value = file
  showCropper.value = true
}

function handleCrop(blob: Blob) {
  showCropper.value = false
  cropperFile.value = null

  // 将 blob 转为 File
  const croppedFile = new File([blob], 'cropped.jpg', { type: 'image/jpeg' })
  uploadCroppedFile(croppedFile)
}

function handleCropCancel() {
  showCropper.value = false
  cropperFile.value = null
}

async function uploadCroppedFile(file: File) {
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

    let result: { photo: string }
    if (props.mode === 'cover') {
      result = await memberApi.uploadCoverPhoto(props.memberId, file)
    } else {
      result = await memberApi.uploadPhoto(props.memberId, file)
    }

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
  <div class="photo-uploader" :class="[`mode-${mode}`]">
    <div
      class="upload-area"
      :class="{ dragging: isDragging, 'has-photo': hasPhoto }"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <div v-if="hasPhoto" class="photo-preview">
        <img :src="resolvePhotoUrl(previewUrl)" :alt="memberName" />
        <div class="photo-overlay">
          <button
            type="button"
            class="overlay-btn remove"
            :disabled="isUploading"
            title="移除"
            @click="removePhoto"
          >
            <X :size="16" />
          </button>
        </div>
      </div>
      <div v-else class="upload-placeholder">
        <div class="initials-avatar" :class="{ wide: mode === 'cover' }">
          <template v-if="mode === 'cover'">
            <ImageIcon :size="24" />
          </template>
          <template v-else>
            {{ getInitials(memberName) }}
          </template>
        </div>
        <div class="upload-hint">
          <Upload :size="20" />
          <span>{{ mode === 'cover' ? '点击或拖拽上传背景图' : '点击或拖拽上传照片' }}</span>
          <span class="upload-spec">
            {{ mode === 'cover' ? '裁剪为 9:16 竖向' : '裁剪为 5:7 证件照' }} · 支持 jpg、png、webp
          </span>
        </div>
        <input
          ref="fileInput"
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

    <!-- 裁剪弹窗 -->
    <ImageCropper
      v-if="showCropper && cropperFile"
      :file="cropperFile"
      :aspect-ratio="aspectRatio"
      :output-width="outputWidth"
      :output-height="outputHeight"
      @crop="handleCrop"
      @cancel="handleCropCancel"
    />
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

/* 头像模式预览 */
.mode-avatar .photo-preview {
  position: relative;
  width: 100px;
  height: 140px;
  margin: 12px auto;
  border-radius: 8px;
  overflow: hidden;
}

/* 背景模式预览 */
.mode-cover .photo-preview {
  position: relative;
  width: 100%;
  height: 200px;
}

.mode-cover .photo-preview img {
  object-fit: contain;
}

.photo-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(0, 0, 0, 0.4);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.photo-preview:hover .photo-overlay {
  opacity: 1;
}

.overlay-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.9);
  color: #333;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s ease;
}

.overlay-btn:hover {
  background: white;
  transform: scale(1.1);
}

.overlay-btn.remove {
  background: rgba(220, 50, 50, 0.9);
  color: white;
}

.overlay-btn.remove:hover {
  background: rgba(200, 30, 30, 1);
}

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  min-height: 160px;
}

.mode-cover .upload-placeholder {
  min-height: 200px;
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
  width: 60px;
  height: 84px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #10201c, #087c89 54%, #b7791f);
  color: white;
  font-size: 20px;
  font-weight: 800;
  border-radius: 8px;
  margin-bottom: 12px;
}

.initials-avatar.wide {
  width: 120px;
  height: 60px;
  border-radius: 8px;
  font-size: 16px;
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
