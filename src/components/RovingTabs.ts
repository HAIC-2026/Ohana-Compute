import { useId, useRef } from 'react'
import type { KeyboardEvent } from 'react'

type Options<TValue extends string> = {
  label: string
  values: readonly TValue[]
  selectedValue: TValue
  onSelect: (value: TValue) => void
  orientation?: 'horizontal' | 'vertical'
}

function safeID(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-')
}

export function useRovingTabs<TValue extends string>({
  label,
  values,
  selectedValue,
  onSelect,
  orientation = 'horizontal',
}: Options<TValue>) {
  const instanceID = useId().replaceAll(':', '')
  const tabs = useRef(new Map<TValue, HTMLButtonElement>())

  const selectAt = (index: number) => {
    const value = values[(index + values.length) % values.length]
    if (!value) return
    onSelect(value)
    requestAnimationFrame(() => tabs.current.get(value)?.focus())
  }

  const onKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    value: TValue,
  ) => {
    const index = values.indexOf(value)
    if (index < 0) return

    const previousKey = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft'
    const nextKey = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight'
    if (event.key === previousKey) {
      event.preventDefault()
      selectAt(index - 1)
    } else if (event.key === nextKey) {
      event.preventDefault()
      selectAt(index + 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      selectAt(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      selectAt(values.length - 1)
    }
  }

  return {
    tabListProps: {
      role: 'tablist' as const,
      'aria-label': label,
      'aria-orientation': orientation,
    },
    getTabProps: (value: TValue) => ({
      id: `${instanceID}-tab-${safeID(value)}`,
      role: 'tab' as const,
      tabIndex: value === selectedValue ? 0 : -1,
      'aria-selected': value === selectedValue,
      'aria-controls': `${instanceID}-panel`,
      ref: (node: HTMLButtonElement | null) => {
        if (node) tabs.current.set(value, node)
        else tabs.current.delete(value)
      },
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) =>
        onKeyDown(event, value),
    }),
    panelProps: {
      id: `${instanceID}-panel`,
      role: 'tabpanel' as const,
      'aria-labelledby': `${instanceID}-tab-${safeID(selectedValue)}`,
    },
  }
}
