// Validate translations shared by the pinned release and the recorded development revision.
export const tokens = text => (text.match(/\{\w+\}|(?<![A-Za-z0-9/])\/[A-Za-z][\w-]*(?:=[\w-]+| (?:on|off))?|\b[a-z]+_[a-z_]+\b/gu) ?? []).sort().join(',')

/** Check every live key and any explicitly retained keys from the other supported revision. */
export function compareDictionary(namespace, korean, english, compatibility) {
  const problems = []
  for (const key of Object.keys(english)) {
    if (!(key in korean)) problems.push(`${namespace}: missing ${key} (en: ${JSON.stringify(english[key])})`)
  }
  let checked = 0
  let retained = 0
  for (const [key, text] of Object.entries(korean)) {
    let original = english[key]
    if (!(key in english)) {
      original = compatibility.releaseOnly[namespace]?.[key] ?? compatibility.masterOnly[namespace]?.[key]
      if (original === undefined) { problems.push(`${namespace}: extra ${key}`); continue }
      retained++
    } else checked++
    const shared = compatibility.sharedText[namespace]?.[key]
    if (shared) {
      if (!shared.english.includes(original)) problems.push(`${namespace}: ${key} has an unreviewed upstream template`)
      if (text !== shared.korean) problems.push(`${namespace}: ${key} differs from its reviewed shared translation`)
    } else if (tokens(text) !== tokens(original)) {
      problems.push(`${namespace}: ${key} changes tokens (en ${JSON.stringify(original)})`)
    }
  }
  return { problems, checked, retained }
}

/** Retained keys must remain translated and preserve their recorded arguments. */
export function validateCompatibility(dictionaries, compatibility) {
  const problems = []
  for (const group of [compatibility.releaseOnly, compatibility.masterOnly]) {
    for (const [namespace, entries] of Object.entries(group)) {
      for (const [key, original] of Object.entries(entries)) {
        const text = dictionaries[namespace]?.[key]
        if (text === undefined) problems.push(`${namespace}: missing retained translation ${key}`)
        else if (tokens(text) !== tokens(original)) problems.push(`${namespace}: retained ${key} changes tokens`)
      }
    }
  }
  for (const [namespace, entries] of Object.entries(compatibility.sharedText)) {
    for (const [key, shared] of Object.entries(entries)) {
      if (dictionaries[namespace]?.[key] !== shared.korean) problems.push(`${namespace}: ${key} differs from its reviewed shared translation`)
    }
  }
  return problems
}
