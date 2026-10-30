export function stableStringify(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

// A deterministic change checksum, not a signature or proof of authority.
export function fnvDigest(text: string) {
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85ebca6b)
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`
}

export function contentDigest(value: unknown) {
  return `fnv1a-dual-v1:${fnvDigest(stableStringify(value))}`
}

export function rejectDuplicateKeys(text: string) {
  const objects: Array<Set<string> | null> = []
  for (let index = 0; index < text.length; index++) {
    const token = text[index]
    if (token === '{') objects.push(new Set())
    else if (token === '[') objects.push(null)
    else if (token === '}' || token === ']') objects.pop()
    else if (token === '"') {
      const start = index++
      while (index < text.length) {
        if (text[index] === '\\') index += 2
        else if (text[index] === '"') break
        else index++
      }
      let next = index + 1
      while (next < text.length && /\s/.test(text[next] ?? '')) next++
      if (text[next] === ':') {
        const key: string = JSON.parse(text.slice(start, index + 1))
        const keys = objects[objects.length - 1]
        if (keys?.has(key))
          throw new Error('Duplicate JSON fields are not allowed.')
        keys?.add(key)
      }
    }
  }
}
