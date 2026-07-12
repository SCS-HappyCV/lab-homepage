<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'

interface Props {
  file: File
  aspectRatio: number // 宽高比，如 1 = 头像, 16/9 = 背景
  outputWidth?: number // 输出宽度
  outputHeight?: number // 输出高度
}

interface Emits {
  (e: 'crop', blob: Blob): void
  (e: 'cancel'): void
}

const props = withDefaults(defineProps<Props>(), {
  outputWidth: 800,
  outputHeight: 800,
})

const emit = defineEmits<Emits>()

const containerRef = ref<HTMLDivElement>()

const imageSrc = ref('')
const imageWidth = ref(0)
const imageHeight = ref(0)

// 裁剪框在容器坐标系中的位置（百分比 0-1）
const cropX = ref(0)
const cropY = ref(0)
const cropW = ref(1)
const cropH = ref(1)

// 拖拽状态
const isDragging = ref(false)
const isResizing = ref(false)
const resizeHandle = ref('')
const dragStartX = ref(0)
const dragStartY = ref(0)
const dragStartCropX = ref(0)
const dragStartCropY = ref(0)
const dragStartCropW = ref(0)
const dragStartCropH = ref(0)

// 容器尺寸
const containerWidth = ref(0)
const containerHeight = ref(0)

// 图片在容器中的实际渲染区域
const imgRenderX = ref(0)
const imgRenderY = ref(0)
const imgRenderW = ref(0)
const imgRenderH = ref(0)

const MIN_CROP_RATIO = 0.05 // 最小裁剪区域占容器的 5%

onMounted(() => {
  loadImage()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (imageSrc.value) {
    URL.revokeObjectURL(imageSrc.value)
  }
})

function loadImage() {
  imageSrc.value = URL.createObjectURL(props.file)

  const img = new Image()
  img.onload = () => {
    imageWidth.value = img.naturalWidth
    imageHeight.value = img.naturalHeight
    nextTick(() => {
      calculateLayout()
      initCropBox()
    })
  }
  img.src = imageSrc.value
}

function handleResize() {
  calculateLayout()
}

function calculateLayout() {
  if (!containerRef.value) return

  const rect = containerRef.value.getBoundingClientRect()
  containerWidth.value = rect.width
  containerHeight.value = rect.height

  if (!imageWidth.value || !imageHeight.value) return

  // 计算图片在容器中的 fit-contain 渲染区域
  const containerAspect = rect.width / rect.height
  const imageAspect = imageWidth.value / imageHeight.value

  if (imageAspect > containerAspect) {
    // 图片更宽，以宽度为准
    imgRenderW.value = rect.width
    imgRenderH.value = rect.width / imageAspect
    imgRenderX.value = 0
    imgRenderY.value = (rect.height - imgRenderH.value) / 2
  } else {
    // 图片更高，以高度为准
    imgRenderH.value = rect.height
    imgRenderW.value = rect.height * imageAspect
    imgRenderX.value = (rect.width - imgRenderW.value) / 2
    imgRenderY.value = 0
  }
}

function initCropBox() {
  // 初始化裁剪框：居中，尽可能大
  const ar = props.aspectRatio
  const imgW = imgRenderW.value
  const imgH = imgRenderH.value
  const imgX = imgRenderX.value
  const imgY = imgRenderY.value

  let w: number, h: number

  if (imgW / imgH > ar) {
    // 图片相对更宽，以高度为基准
    h = imgH * 0.8
    w = h * ar
  } else {
    // 图片相对更高，以宽度为基准
    w = imgW * 0.8
    h = w / ar
  }

  // 转换为容器百分比
  cropW.value = w / containerWidth.value
  cropH.value = h / containerHeight.value
  cropX.value = (imgX + (imgW - w) / 2) / containerWidth.value
  cropY.value = (imgY + (imgH - h) / 2) / containerHeight.value
}

// 将容器坐标转为图片坐标
function containerToImage(cx: number, cy: number, cw: number, ch: number) {
  // 从容器坐标转为图片像素坐标
  const scaleX = imageWidth.value / imgRenderW.value
  const scaleY = imageHeight.value / imgRenderH.value

  const px = (cx * containerWidth.value - imgRenderX.value) * scaleX
  const py = (cy * containerHeight.value - imgRenderY.value) * scaleY
  const pw = cw * containerWidth.value * scaleX
  const ph = ch * containerHeight.value * scaleY

  return {
    x: Math.max(0, Math.round(px)),
    y: Math.max(0, Math.round(py)),
    width: Math.min(Math.round(pw), imageWidth.value),
    height: Math.min(Math.round(ph), imageHeight.value),
  }
}

function handleMouseDown(e: MouseEvent) {
  e.preventDefault()
  const rect = containerRef.value!.getBoundingClientRect()
  const mx = (e.clientX - rect.left) / rect.width
  const my = (e.clientY - rect.top) / rect.height

  // 检查是否点击在裁剪框边缘/角落（调整大小）
  const handle = getResizeHandle(mx, my)
  if (handle) {
    isResizing.value = true
    resizeHandle.value = handle
  } else if (isInsideCrop(mx, my)) {
    isDragging.value = true
  } else {
    return
  }

  dragStartX.value = mx
  dragStartY.value = my
  dragStartCropX.value = cropX.value
  dragStartCropY.value = cropY.value
  dragStartCropW.value = cropW.value
  dragStartCropH.value = cropH.value

  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

function handleTouchStart(e: TouchEvent) {
  if (e.touches.length !== 1) return
  const touch = e.touches[0]
  const rect = containerRef.value!.getBoundingClientRect()
  const mx = (touch.clientX - rect.left) / rect.width
  const my = (touch.clientY - rect.top) / rect.height

  const handle = getResizeHandle(mx, my)
  if (handle) {
    isResizing.value = true
    resizeHandle.value = handle
  } else if (isInsideCrop(mx, my)) {
    isDragging.value = true
  } else {
    return
  }

  dragStartX.value = mx
  dragStartY.value = my
  dragStartCropX.value = cropX.value
  dragStartCropY.value = cropY.value
  dragStartCropW.value = cropW.value
  dragStartCropH.value = cropH.value

  document.addEventListener('touchmove', handleTouchMove, { passive: false })
  document.addEventListener('touchend', handleTouchEnd)
}

function handleMouseMove(e: MouseEvent) {
  const rect = containerRef.value!.getBoundingClientRect()
  const mx = (e.clientX - rect.left) / rect.width
  const my = (e.clientY - rect.top) / rect.height
  updateCrop(mx, my)
}

function handleTouchMove(e: TouchEvent) {
  e.preventDefault()
  const touch = e.touches[0]
  const rect = containerRef.value!.getBoundingClientRect()
  const mx = (touch.clientX - rect.left) / rect.width
  const my = (touch.clientY - rect.top) / rect.height
  updateCrop(mx, my)
}

function handleMouseUp() {
  isDragging.value = false
  isResizing.value = false
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
}

function handleTouchEnd() {
  isDragging.value = false
  isResizing.value = false
  document.removeEventListener('touchmove', handleTouchMove)
  document.removeEventListener('touchend', handleTouchEnd)
}

function updateCrop(mx: number, my: number) {
  const dx = mx - dragStartX.value
  const dy = my - dragStartY.value
  const ar = props.aspectRatio

  if (isDragging.value) {
    // 拖拽移动
    let newX = dragStartCropX.value + dx
    let newY = dragStartCropY.value + dy

    // 限制在图片区域内
    const imgLeft = imgRenderX.value / containerWidth.value
    const imgTop = imgRenderY.value / containerHeight.value
    const imgRight = (imgRenderX.value + imgRenderW.value) / containerWidth.value
    const imgBottom = (imgRenderY.value + imgRenderH.value) / containerHeight.value

    newX = Math.max(imgLeft, Math.min(newX, imgRight - cropW.value))
    newY = Math.max(imgTop, Math.min(newY, imgBottom - cropH.value))

    cropX.value = newX
    cropY.value = newY
  } else if (isResizing.value) {
    // 调整大小：用统一 scale 保持比例，一次边界修正
    const handle = resizeHandle.value
    const startW = dragStartCropW.value
    const startH = dragStartCropH.value

    // 1. 根据拖拽方向计算 scale
    let scale: number
    if (['se', 'nw', 'ne', 'sw'].includes(handle)) {
      // 角落：用对角拖拽
      const startDiag = Math.sqrt(startW * startW + startH * startH)
      const diag = dx * (handle === 'se' || handle === 'ne' ? 1 : -1)
        + dy * (handle === 'se' || handle === 'sw' ? 1 : -1)
      scale = (startDiag + diag) / startDiag
    } else if (handle === 'e' || handle === 'w') {
      const sign = handle === 'e' ? 1 : -1
      scale = (startW + dx * sign) / startW
    } else {
      const sign = handle === 's' ? 1 : -1
      scale = (startH + dy * sign) / startH
    }
    scale = Math.max(MIN_CROP_RATIO / Math.min(startW, startH), scale)

    // 2. 统一计算新尺寸
    let newW = startW * scale
    let newH = startH * scale

    // 3. 锚点定位（不拖拽的一侧固定）
    let newX = handle.includes('w')
      ? dragStartCropX.value + startW - newW
      : dragStartCropX.value
    let newY = handle.includes('n')
      ? dragStartCropY.value + startH - newH
      : dragStartCropY.value

    // 4. 边界限制：统一缩放
    const imgL = imgRenderX.value / containerWidth.value
    const imgT = imgRenderY.value / containerHeight.value
    const imgR = (imgRenderX.value + imgRenderW.value) / containerWidth.value
    const imgB = (imgRenderY.value + imgRenderH.value) / containerHeight.value

    if (newX < imgL) {
      scale = Math.min(scale, (startW + dragStartCropX.value - imgL) / startW)
    }
    if (newY < imgT) {
      scale = Math.min(scale, (startH + dragStartCropY.value - imgT) / startH)
    }
    if (newX + newW > imgR) {
      const anchorX = handle.includes('w') ? dragStartCropX.value + startW : dragStartCropX.value
      scale = Math.min(scale, (imgR - anchorX) / startW)
    }
    if (newY + newH > imgB) {
      const anchorY = handle.includes('n') ? dragStartCropY.value + startH : dragStartCropY.value
      scale = Math.min(scale, (imgB - anchorY) / startH)
    }

    // 用修正后的 scale 重新计算
    scale = Math.max(MIN_CROP_RATIO / Math.min(startW, startH), scale)
    newW = startW * scale
    newH = startH * scale
    newX = handle.includes('w') ? dragStartCropX.value + startW - newW : dragStartCropX.value
    newY = handle.includes('n') ? dragStartCropY.value + startH - newH : dragStartCropY.value

    cropX.value = newX
    cropY.value = newY
    cropW.value = newW
    cropH.value = newH
  }
}

function getResizeHandle(mx: number, my: number): string {
  const threshold = 0.02
  const left = cropX.value
  const top = cropY.value
  const right = cropX.value + cropW.value
  const bottom = cropY.value + cropH.value

  const nearLeft = Math.abs(mx - left) < threshold
  const nearRight = Math.abs(mx - right) < threshold
  const nearTop = Math.abs(my - top) < threshold
  const nearBottom = Math.abs(my - bottom) < threshold

  if (nearLeft && nearTop) return 'nw'
  if (nearRight && nearTop) return 'ne'
  if (nearLeft && nearBottom) return 'sw'
  if (nearRight && nearBottom) return 'se'
  if (nearLeft && my > top && my < bottom) return 'w'
  if (nearRight && my > top && my < bottom) return 'e'
  if (nearTop && mx > left && mx < right) return 'n'
  if (nearBottom && mx > left && mx < right) return 's'

  return ''
}

function isInsideCrop(mx: number, my: number): boolean {
  return mx >= cropX.value && mx <= cropX.value + cropW.value &&
    my >= cropY.value && my <= cropY.value + cropH.value
}

function getCursorStyle(): string {
  // 返回默认光标，实际交互中由 CSS handle 控制
  return 'move'
}

async function handleConfirm() {
  const crop = containerToImage(cropX.value, cropY.value, cropW.value, cropH.value)

  // 使用 canvas 裁剪
  const canvas = document.createElement('canvas')
  canvas.width = props.outputWidth
  canvas.height = props.outputHeight

  const ctx = canvas.getContext('2d')!
  const img = new Image()

  await new Promise<void>((resolve) => {
    img.onload = () => resolve()
    img.src = imageSrc.value
  })

  ctx.drawImage(
    img,
    crop.x, crop.y, crop.width, crop.height,
    0, 0, props.outputWidth, props.outputHeight,
  )

  canvas.toBlob((blob) => {
    if (blob) {
      emit('crop', blob)
    }
  }, 'image/jpeg', 0.9)
}

function handleCancel() {
  emit('cancel')
}
</script>

<template>
  <div class="cropper-overlay">
    <div class="cropper-dialog">
      <div class="cropper-header">
        <h3>裁剪图片</h3>
        <p>拖动裁剪框选择区域，拖拽边角可调整大小</p>
      </div>

      <div
        ref="containerRef"
        class="cropper-container"
        @mousedown="handleMouseDown"
        @touchstart.passive="handleTouchStart"
      >
        <img
          v-if="imageSrc"
          :src="imageSrc"
          class="cropper-image"
          :style="{
            left: imgRenderX + 'px',
            top: imgRenderY + 'px',
            width: imgRenderW + 'px',
            height: imgRenderH + 'px',
          }"
          draggable="false"
        />

        <!-- 遮罩层 -->
        <svg class="cropper-mask" :width="containerWidth" :height="containerHeight">
          <defs>
            <mask id="cropMask">
              <rect width="100%" height="100%" fill="white" />
              <rect
                :x="cropX * containerWidth"
                :y="cropY * containerHeight"
                :width="cropW * containerWidth"
                :height="cropH * containerHeight"
                fill="black"
              />
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.5)"
            mask="url(#cropMask)"
          />
        </svg>

        <!-- 裁剪框 -->
        <div
          class="crop-box"
          :style="{
            left: (cropX * 100) + '%',
            top: (cropY * 100) + '%',
            width: (cropW * 100) + '%',
            height: (cropH * 100) + '%',
            cursor: isDragging ? 'grabbing' : 'grab',
          }"
        >
          <!-- 网格线 -->
          <div class="crop-grid">
            <div class="crop-grid-h" style="top: 33.33%"></div>
            <div class="crop-grid-h" style="top: 66.66%"></div>
            <div class="crop-grid-v" style="left: 33.33%"></div>
            <div class="crop-grid-v" style="left: 66.66%"></div>
          </div>

          <!-- 四角手柄（事件由容器统一处理） -->
          <div class="crop-handle crop-handle-nw"></div>
          <div class="crop-handle crop-handle-ne"></div>
          <div class="crop-handle crop-handle-sw"></div>
          <div class="crop-handle crop-handle-se"></div>
        </div>
      </div>

      <div class="cropper-actions">
        <button type="button" class="cropper-btn cropper-btn-cancel" @click="handleCancel">取消</button>
        <button type="button" class="cropper-btn cropper-btn-confirm" @click="handleConfirm">确认裁剪</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cropper-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
}

.cropper-dialog {
  background: var(--bg, #fff);
  border-radius: 16px;
  overflow: hidden;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.cropper-header {
  padding: 20px 24px 12px;
  text-align: center;
}

.cropper-header h3 {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 700;
  color: var(--ink, #1a1a1a);
}

.cropper-header p {
  margin: 0;
  font-size: 13px;
  color: var(--muted, #888);
}

.cropper-container {
  position: relative;
  width: min(600px, 80vw);
  height: min(450px, 60vh);
  margin: 0 24px;
  background: #1a1a1a;
  border-radius: 8px;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

.cropper-image {
  position: absolute;
  object-fit: contain;
  pointer-events: none;
}

.cropper-mask {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.crop-box {
  position: absolute;
  border: 2px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3);
}

.crop-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.crop-grid-h,
.crop-grid-v {
  position: absolute;
  background: rgba(255, 255, 255, 0.25);
}

.crop-grid-h {
  left: 0;
  right: 0;
  height: 1px;
}

.crop-grid-v {
  top: 0;
  bottom: 0;
  width: 1px;
}

.crop-handle {
  position: absolute;
  width: 24px;
  height: 24px;
  background: white;
  border: 2px solid var(--green, #10b981);
  border-radius: 50%;
  z-index: 10;
  pointer-events: auto;
}

.crop-handle-nw {
  top: -12px;
  left: -12px;
  cursor: nw-resize;
}

.crop-handle-ne {
  top: -12px;
  right: -12px;
  cursor: ne-resize;
}

.crop-handle-sw {
  bottom: -12px;
  left: -12px;
  cursor: sw-resize;
}

.crop-handle-se {
  bottom: -12px;
  right: -12px;
  cursor: se-resize;
}

.cropper-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  padding: 16px 24px 20px;
}

.cropper-btn {
  padding: 10px 28px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cropper-btn-cancel {
  background: var(--line, #e5e5e5);
  color: var(--ink, #1a1a1a);
}

.cropper-btn-cancel:hover {
  background: #d0d0d0;
}

.cropper-btn-confirm {
  background: var(--green, #10b981);
  color: white;
}

.cropper-btn-confirm:hover {
  background: #0d9668;
}

@media (max-width: 640px) {
  .cropper-container {
    width: 90vw;
    height: 60vh;
    margin: 0 12px;
  }

  .cropper-header {
    padding: 16px 16px 8px;
  }

  .cropper-actions {
    padding: 12px 16px 16px;
  }
}
</style>
