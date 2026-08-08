<script setup lang="ts">
import { computed, nextTick, ref, watch, onBeforeUnmount } from 'vue'
import { Calendar } from 'lucide-vue-next'

interface Props {
  modelValue?: string
  max?: string
  min?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const isOpen = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const popoverRef = ref<HTMLElement | null>(null)

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const today = new Date()
today.setHours(0, 0, 0, 0)

function parseDate(raw?: string): Date | null {
  if (!raw) return null
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const [, y, m, d] = match
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  return Number.isNaN(date.getTime()) ? null : date
}

const selected = computed(() => parseDate(props.modelValue))

const viewYear = ref(today.getFullYear())
const viewMonth = ref(today.getMonth()) // 0-11

watch(
  () => props.modelValue,
  (raw) => {
    const date = parseDate(raw)
    if (date) {
      viewYear.value = date.getFullYear()
      viewMonth.value = date.getMonth()
    }
  },
)

const maxDate = computed(() => parseDate(props.max))
const minDate = computed(() => parseDate(props.min))

const currentYear = today.getFullYear()
const years = computed(() => {
  const maxY = maxDate.value ? maxDate.value.getFullYear() : currentYear
  const minY = minDate.value ? minDate.value.getFullYear() : currentYear - 100
  const list: number[] = []
  for (let y = minY; y <= maxY; y++) list.push(y)
  return list
})

const months = computed(() => {
  const maxY = maxDate.value?.getFullYear()
  const minY = minDate.value?.getFullYear()
  return Array.from({ length: 12 }, (_, i) => {
    let disabled = false
    if (maxY !== undefined && viewYear.value === maxY && i > (maxDate.value as Date).getMonth()) disabled = true
    if (minY !== undefined && viewYear.value === minY && i < (minDate.value as Date).getMonth()) disabled = true
    return { value: i, label: `${i + 1}月`, disabled }
  })
})

const days = computed(() => {
  const year = viewYear.value
  const month = viewMonth.value
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: Array<{ day: number | null; date: Date | null; disabled: boolean; selected: boolean }> = []

  for (let i = 0; i < firstDay; i++) {
    cells.push({ day: null, date: null, disabled: true, selected: false })
  }

  const sel = selected.value
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d)
    let disabled = false
    if (maxDate.value && date > maxDate.value) disabled = true
    if (minDate.value && date < minDate.value) disabled = true
    const isSelected = !!sel && date.getTime() === sel.getTime()
    cells.push({ day: d, date, disabled, selected: isSelected })
  }

  return cells
})

const popoverStyle = ref<{ top: string; left: string }>({ top: '0px', left: '0px' })

function positionPopover() {
  const trigger = triggerRef.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  const popWidth = 280
  const popHeight = 320
  const margin = 8

  let left = rect.left
  if (left + popWidth > window.innerWidth - margin) {
    left = window.innerWidth - popWidth - margin
  }
  if (left < margin) left = margin

  let top = rect.bottom + 6
  if (top + popHeight > window.innerHeight - margin) {
    top = rect.top - popHeight - 6
  }

  popoverStyle.value = { top: `${top}px`, left: `${left}px` }
}

function open() {
  const date = selected.value ?? today
  viewYear.value = date.getFullYear()
  viewMonth.value = date.getMonth()
  isOpen.value = true
  nextTick(positionPopover)
}

function close() {
  isOpen.value = false
}

function toggle() {
  if (isOpen.value) close()
  else open()
}

function selectDay(date: Date | null, disabled: boolean) {
  if (!date || disabled) return
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  emit('update:modelValue', `${y}-${m}-${d}`)
  close()
}

function clear() {
  emit('update:modelValue', '')
  close()
}

function handleDocumentClick(event: MouseEvent) {
  if (!isOpen.value) return
  const target = event.target as Node
  if (popoverRef.value?.contains(target) || triggerRef.value?.contains(target)) return
  close()
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

document.addEventListener('click', handleDocumentClick)
document.addEventListener('keydown', handleKeydown)

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
  document.removeEventListener('keydown', handleKeydown)
})

const displayText = computed(() => {
  const date = selected.value
  if (!date) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
})
</script>

<template>
  <div class="date-picker" :class="{ open: isOpen }">
    <button
      ref="triggerRef"
      type="button"
      class="date-picker-trigger"
      :class="{ placeholder: !displayText }"
      @click="toggle"
    >
      <Calendar :size="16" />
      <span>{{ displayText || '选择日期' }}</span>
    </button>

    <Teleport to="body">
      <div v-if="isOpen" ref="popoverRef" class="date-picker-popover" role="dialog" aria-label="选择日期" :style="popoverStyle">
      <div class="date-picker-header">
        <select v-model="viewYear" class="date-picker-select" aria-label="年份">
          <option v-for="y in years" :key="y" :value="y">{{ y }}年</option>
        </select>
        <select v-model.number="viewMonth" class="date-picker-select" aria-label="月份">
          <option v-for="m in months" :key="m.value" :value="m.value" :disabled="m.disabled">{{ m.label }}</option>
        </select>
      </div>

      <div class="date-picker-weekdays">
        <span v-for="w in WEEKDAYS" :key="w">{{ w }}</span>
      </div>

      <div class="date-picker-days">
        <button
          v-for="(cell, index) in days"
          :key="index"
          type="button"
          class="date-picker-day"
          :class="{
            empty: cell.day === null,
            selected: cell.selected,
            disabled: cell.disabled && cell.day !== null,
          }"
          :disabled="cell.disabled"
          @click="selectDay(cell.date, cell.disabled)"
        >
          {{ cell.day }}
        </button>
      </div>

      <div class="date-picker-footer">
        <button type="button" class="date-picker-clear" @click="clear">清除</button>
        <button type="button" class="date-picker-today" @click="selectDay(today, false)">今天</button>
      </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.date-picker {
  position: relative;
  width: 100%;
}

.date-picker-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #ffffff;
  color: var(--ink);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.date-picker-trigger:hover {
  border-color: var(--green);
}

.date-picker.open .date-picker-trigger {
  border-color: var(--green);
}

.date-picker-trigger.placeholder {
  color: #9aa5a0;
}

.date-picker-popover {
  position: fixed;
  z-index: 100;
  width: 280px;
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);
  padding: 14px;
  animation: datePickerFadeIn 0.15s ease;
}

@keyframes datePickerFadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.date-picker-header {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 12px;
}

.date-picker-select {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #ffffff;
  color: var(--ink);
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
}

.date-picker-select:focus {
  outline: none;
  border-color: var(--green);
}

.date-picker-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  margin-bottom: 4px;
}

.date-picker-weekdays span {
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
  padding: 4px 0;
}

.date-picker-days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.date-picker-day {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ink);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.date-picker-day.empty {
  cursor: default;
}

.date-picker-day:not(.empty):not(.disabled):hover {
  background: var(--soft);
}

.date-picker-day.selected {
  background: var(--ink);
  color: #ffffff;
}

.date-picker-day.disabled {
  color: #c4ccc7;
  cursor: not-allowed;
}

.date-picker-footer {
  display: flex;
  justify-content: space-between;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}

.date-picker-footer button {
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.date-picker-footer button:hover {
  background: var(--soft);
  color: var(--ink);
}
</style>
