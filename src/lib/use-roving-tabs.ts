import { useId, useRef } from 'react'
import type { KeyboardEvent } from 'react'

type RovingTabsOptions<TValue extends string> = {
  values: readonly TValue[]
  selectedValue: TValue | null
  onSelect: (value: TValue) => void
}

export function useRovingTabs<TValue extends string>({
  values,
  selectedValue,
  onSelect,
}: RovingTabsOptions<TValue>) {
  const generatedId = useId().replaceAll(':', '')
  const tabRefs = useRef(new Map<TValue, HTMLButtonElement>())

  const activateAndFocus = (value: TValue) => {
    onSelect(value)
    requestAnimationFrame(() => tabRefs.current.get(value)?.focus())
  }

  const getTabProps = (value: TValue) => {
    const index = values.indexOf(value)
    const tabId = `tabs-${generatedId}-tab-${index}`
    const panelId = `tabs-${generatedId}-panel-${index}`

    return {
      id: tabId,
      'aria-controls': panelId,
      'aria-selected': value === selectedValue,
      role: 'tab' as const,
      tabIndex: value === selectedValue ? 0 : -1,
      ref: (element: HTMLButtonElement | null) => {
        if (element) tabRefs.current.set(value, element)
        else tabRefs.current.delete(value)
      },
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        let nextIndex: number | null = null

        if (event.key === 'ArrowRight') {
          if (values.length === 0) return
          nextIndex = (index + 1) % values.length
        } else if (event.key === 'ArrowLeft') {
          if (values.length === 0) return
          nextIndex = (index - 1 + values.length) % values.length
        } else if (event.key === 'Home') {
          nextIndex = 0
        } else if (event.key === 'End') {
          nextIndex = values.length - 1
        }

        if (nextIndex === null) return
        event.preventDefault()
        activateAndFocus(values[nextIndex])
      },
    }
  }

  const getPanelProps = (value: TValue) => {
    const index = values.indexOf(value)
    return {
      id: `tabs-${generatedId}-panel-${index}`,
      'aria-labelledby': `tabs-${generatedId}-tab-${index}`,
      role: 'tabpanel' as const,
      tabIndex: 0,
    }
  }

  return { getPanelProps, getTabProps }
}
