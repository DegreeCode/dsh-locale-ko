// Compare dictionaries/*.json against the English client dictionaries of a DeepSeek Harness checkout.
// Usage (from this repo): <dsh-checkout>/node_modules/.bin/tsx --tsconfig <dsh-checkout>/tsconfig.base.json scripts/compare-upstream.mts <dsh-checkout>
// The Harness tsconfig maps workspace imports to src; without it an unbuilt checkout fails on imports that resolve to lib/.
// Reports namespaces and keys that are missing, extra, or that change {placeholders}, /commands or snake_case tokens.
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { register } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Client modules import CSS and assets; evaluate them as inert modules so dictionary constants can load.
register(`data:text/javascript,${encodeURIComponent(`export async function load(url, context, next) {
  if (/\\.(css|svg|png|jpe?g|webp|woff2?|wasm|txt|md)(\\?.*)?$/.test(url)) return { format: 'module', shortCircuit: true, source: 'export default new Proxy({}, { get: (_, k) => String(k) })' }
  return next(url, context)
}`)}`)

const DSH = resolve(process.argv[2] ?? '.')
const here = fileURLToPath(new URL('..', import.meta.url))
const require = (await import('node:module')).createRequire(`${DSH}/package.json`)
const ts: typeof import('typescript') = require('typescript')

const parsed = new Map<string, import('typescript').SourceFile>()
const source = (file: string) => {
  let s = parsed.get(file)
  if (!s) parsed.set(file, s = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ESNext, true))
  return s
}
const strip = (e: import('typescript').Expression): import('typescript').Expression => {
  while (ts.isAsExpression(e) || ts.isParenthesizedExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression
  return e
}
type Ref = { file: string; name: string; imported: boolean; init?: import('typescript').Expression }
function resolveId(file: string, name: string): Ref | undefined {
  const src = source(file)
  for (const st of src.statements) {
    if (ts.isImportDeclaration(st) && st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings)) {
      for (const el of st.importClause.namedBindings.elements) {
        if (el.name.text !== name) continue
        const spec = (st.moduleSpecifier as import('typescript').StringLiteral).text
        return { file: spec.startsWith('.') ? resolve(dirname(file), spec) : spec, name: (el.propertyName ?? el.name).text, imported: true }
      }
    }
  }
  let found: Ref | undefined
  const walk = (n: import('typescript').Node): void => {
    if (!found && ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name) found = { file, name, imported: false, init: n.initializer }
    ts.forEachChild(n, walk)
  }
  walk(src)
  return found
}
async function valueOf(file: string, expr: import('typescript').Expression): Promise<unknown> {
  expr = strip(expr)
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text
  if (ts.isIdentifier(expr)) {
    const ref = resolveId(file, expr.text)
    if (!ref) throw new Error(`unresolved ${expr.text}`)
    if (!ref.imported && ref.init) {
      const init = strip(ref.init)
      if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init) || ts.isIdentifier(init)) return valueOf(ref.file, init)
      if (ts.isObjectLiteralExpression(init)) return init
    }
    const mod = await import(pathToFileURL(/\.tsx?$/.test(ref.file) ? ref.file : `${ref.file}.ts`).href)
    if (!(ref.name in mod)) throw new Error(`${ref.name} is not exported from ${ref.file}`)
    return mod[ref.name]
  }
  if (ts.isObjectLiteralExpression(expr)) return expr
  throw new Error(`unsupported expression ${expr.getText()}`)
}
async function dictOf(file: string, expr: import('typescript').Expression): Promise<Record<string, string>> {
  const value = await valueOf(file, expr)
  if (value && typeof value === 'object' && 'kind' in value && ts.isObjectLiteralExpression(value as never)) {
    const out: Record<string, string> = {}
    for (const p of (value as import('typescript').ObjectLiteralExpression).properties) {
      if (!ts.isPropertyAssignment(p)) throw new Error('unsupported dictionary member')
      const text = strip(p.initializer)
      if (!ts.isStringLiteral(text) && !ts.isNoSubstitutionTemplateLiteral(text)) throw new Error('non-literal dictionary text')
      out[p.name.getText().replace(/^['"]|['"]$/g, '')] = text.text
    }
    return out
  }
  return value as Record<string, string>
}

const english: Record<string, { file: string; dict: Record<string, string> }> = {}
const problems: string[] = []
const files = execSync('git ls-files "packages/*/*/src/**"', { cwd: DSH, encoding: 'utf8' }).split('\n').filter(f => /\.tsx?$/.test(f) && !f.endsWith('.d.ts'))
for (const rel of files) {
  const file = resolve(DSH, rel)
  const text = readFileSync(file, 'utf8')
  if (!text.includes('.register(') || !/\ben\b/.test(text)) continue
  const calls: import('typescript').CallExpression[] = []
  const tuples = new Map<string, import('typescript').Expression>()
  const visit = (n: import('typescript').Node): void => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'register'
      && (ts.isPropertyAccessExpression(n.expression.expression) ? n.expression.expression.name.text === 'locale'
        : ts.isIdentifier(n.expression.expression) && n.expression.expression.text === 'locale')) calls.push(n)
    if (ts.isArrayLiteralExpression(n) && n.elements.length === 2 && ts.isStringLiteral(n.elements[0]) && /^[a-z]{2}$/.test(n.elements[0].text)) tuples.set(n.elements[0].text, n.elements[1])
    ts.forEachChild(n, visit)
  }
  visit(source(file))
  for (const call of calls) {
    const where = `${rel}:${source(file).getLineAndCharacterOfPosition(call.getStart()).line + 1}`
    try {
      const ns = await valueOf(file, call.arguments[0])
      if (typeof ns !== 'string') throw new Error('namespace is not a string literal')
      let dict: Record<string, string> | undefined
      if (call.arguments.length === 3) {
        if (tuples.has('en')) dict = await dictOf(file, tuples.get('en')!)
      } else {
        let map = await valueOf(file, call.arguments[1])
        if (map && typeof map === 'object' && 'kind' in map) {
          const en = (map as import('typescript').ObjectLiteralExpression).properties.find(p => p.name?.getText().replace(/['"]/g, '') === 'en')
          if (en) dict = await dictOf(file, ts.isShorthandPropertyAssignment(en) ? en.name : (en as import('typescript').PropertyAssignment).initializer)
        } else if (map && typeof map === 'object') dict = (map as Record<string, Record<string, string>>).en
      }
      if (!dict) continue
      if (english[ns]) throw new Error(`namespace ${ns} also registered by ${english[ns].file}`)
      english[ns] = { file: where, dict }
    } catch (error) {
      problems.push(`${where}: ${(error as Error).message}`)
    }
  }
}

const tokens = (text: string) => (text.match(/\{\w+\}|(?<![A-Za-z0-9/])\/[A-Za-z][\w-]*(?:=[\w-]+| (?:on|off))?|\b[a-z]+_[a-z_]+\b/gu) ?? []).sort().join(',')
let checked = 0
const ours = readdirSync(`${here}dictionaries`).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5))
for (const ns of ours) {
  const ko = JSON.parse(readFileSync(`${here}dictionaries/${ns}.json`, 'utf8')) as Record<string, string>
  const en = english[ns]?.dict
  if (!en) { problems.push(`${ns}: namespace is not registered by this Harness checkout`); continue }
  for (const key of Object.keys(en)) if (!(key in ko)) problems.push(`${ns}: missing ${key} (en: ${JSON.stringify(en[key])})`)
  for (const key of Object.keys(ko)) {
    if (!(key in en)) { problems.push(`${ns}: extra ${key}`); continue }
    checked++
    if (tokens(ko[key]) !== tokens(en[key])) problems.push(`${ns}: ${key} changes tokens (en ${JSON.stringify(en[key])})`)
  }
}
for (const ns of Object.keys(english)) if (!ours.includes(ns)) problems.push(`${ns}: untranslated namespace (${english[ns].file}, ${Object.keys(english[ns].dict).length} keys)`)
for (const problem of problems) console.log(problem)
console.log(`${Object.keys(english).length} upstream namespaces, ${ours.length} translated, ${checked} keys checked, ${problems.length} problem(s)`)
process.exit(problems.length > 0 ? 1 : 0)
