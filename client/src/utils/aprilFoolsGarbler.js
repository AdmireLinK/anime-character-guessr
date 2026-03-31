const GARBLE_RANGES = [
  [0x00a1, 0x00ff],
  [0x0370, 0x03ff],
  [0x0400, 0x04ff],
  [0x3041, 0x30ff],
  [0x3105, 0x312f],
  [0x4e00, 0x9fa5],
  [0xac00, 0xd7a3],
  [0x2500, 0x257f],
  [0x2580, 0x259f],
  [0x2600, 0x26ff],
]

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'OPTION'])

let garblerInstance = null

export const isAprilFoolsDay = (date = new Date()) => date.getMonth() === 3 && date.getDate() === 1

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

const randomUtf8Char = () => {
  const [start, end] = GARBLE_RANGES[randomInt(0, GARBLE_RANGES.length - 1)]
  return String.fromCodePoint(randomInt(start, end))
}

const garbleText = (text = '') => {
  return Array.from(text)
    .map((char) => (char.trim() ? randomUtf8Char() : char))
    .join('')
}

const shouldTrackTextNode = (node, noGarbleSelector) => {
  if (!(node instanceof Text)) {
    return false
  }

  const rawText = node.textContent ?? ''
  if (!rawText.trim()) {
    return false
  }

  const parent = node.parentElement
  if (!parent || SKIP_TAGS.has(parent.tagName)) {
    return false
  }

  if (parent.closest(noGarbleSelector)) {
    return false
  }

  return true
}

const shouldTrackPlaceholderElement = (element, noGarbleSelector) => {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    return false
  }

  const placeholder = element.getAttribute('placeholder') ?? ''
  if (!placeholder.trim()) {
    return false
  }

  if (element.closest(noGarbleSelector)) {
    return false
  }

  return true
}

const collectTextNodes = (root, callback) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode()

  while (current) {
    callback(current)
    current = walker.nextNode()
  }
}

export const enableAprilFoolsGarbler = ({
  enabled = isAprilFoolsDay(),
  intervalMs = 500,
  noGarbleSelector = '[data-no-garble="true"]',
} = {}) => {
  if (!enabled || typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {}
  }

  if (garblerInstance) {
    return garblerInstance.cleanup
  }

  const trackedNodes = new Set()
  const originalTextMap = new Map()
  const trackedPlaceholderElements = new Set()
  const originalPlaceholderMap = new Map()
  let isApplyingGarblerUpdate = false

  const registerNode = (node) => {
    if (!shouldTrackTextNode(node, noGarbleSelector)) {
      trackedNodes.delete(node)
      originalTextMap.delete(node)
      return
    }

    trackedNodes.add(node)
    originalTextMap.set(node, node.textContent ?? '')
  }

  const registerPlaceholderElement = (element) => {
    if (!shouldTrackPlaceholderElement(element, noGarbleSelector)) {
      trackedPlaceholderElements.delete(element)
      originalPlaceholderMap.delete(element)
      return
    }

    trackedPlaceholderElements.add(element)
    originalPlaceholderMap.set(element, element.getAttribute('placeholder') ?? '')
  }

  const registerFrom = (root) => {
    if (!root) {
      return
    }

    if (root instanceof Text) {
      registerNode(root)
      return
    }

    if (root instanceof Element || root instanceof DocumentFragment) {
      if (root instanceof Element) {
        registerPlaceholderElement(root)
      }

      if ('querySelectorAll' in root) {
        root.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(registerPlaceholderElement)
      }

      collectTextNodes(root, registerNode)
    }
  }

  const cleanupDisconnectedTargets = () => {
    for (const node of trackedNodes) {
      if (!node.isConnected) {
        trackedNodes.delete(node)
        originalTextMap.delete(node)
      }
    }

    for (const element of trackedPlaceholderElements) {
      if (!element.isConnected) {
        trackedPlaceholderElements.delete(element)
        originalPlaceholderMap.delete(element)
      }
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        if (isApplyingGarblerUpdate) {
          continue
        }

        registerNode(mutation.target)
      }

      if (mutation.type === 'attributes') {
        if (isApplyingGarblerUpdate) {
          continue
        }

        registerFrom(mutation.target)
      }

      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(registerFrom)
      }
    }

    cleanupDisconnectedTargets()
  })

  const startObserving = () => {
    if (!document.body) {
      return
    }

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder'],
    })
  }

  const stopObserving = () => observer.disconnect()

  registerFrom(document.body)
  startObserving()

  const timerId = window.setInterval(() => {
    isApplyingGarblerUpdate = true

    try {
      for (const node of trackedNodes) {
        if (!shouldTrackTextNode(node, noGarbleSelector)) {
          trackedNodes.delete(node)
          originalTextMap.delete(node)
          continue
        }

        const originalText = originalTextMap.get(node) ?? node.textContent ?? ''
        node.textContent = garbleText(originalText)
      }

      for (const element of trackedPlaceholderElements) {
        if (!shouldTrackPlaceholderElement(element, noGarbleSelector)) {
          trackedPlaceholderElements.delete(element)
          originalPlaceholderMap.delete(element)
          continue
        }

        const originalPlaceholder = originalPlaceholderMap.get(element) ?? element.getAttribute('placeholder') ?? ''
        element.setAttribute('placeholder', garbleText(originalPlaceholder))
      }
    } finally {
      window.setTimeout(() => {
        isApplyingGarblerUpdate = false
        cleanupDisconnectedTargets()
      }, 0)
    }
  }, intervalMs)

  const cleanup = () => {
    stopObserving()
    window.clearInterval(timerId)

    for (const node of trackedNodes) {
      if (node.isConnected && originalTextMap.has(node)) {
        node.textContent = originalTextMap.get(node)
      }
    }

    for (const element of trackedPlaceholderElements) {
      if (element.isConnected && originalPlaceholderMap.has(element)) {
        element.setAttribute('placeholder', originalPlaceholderMap.get(element))
      }
    }

    trackedNodes.clear()
    originalTextMap.clear()
    trackedPlaceholderElements.clear()
    originalPlaceholderMap.clear()
    garblerInstance = null
  }

  garblerInstance = { cleanup }
  return cleanup
}
