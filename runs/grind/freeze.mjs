// Freeze a validated build for ranked play:  node runs/grind/freeze.mjs NAME LEVEL '{"setting":value}' [--from build-s2]
// Writes runs/grind/rank/NAME/ (refuses to overwrite) with the settings baked into that level's file and a hash manifest.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
const ROOT = resolve(import.meta.dirname, '../..'), HERE = resolve(import.meta.dirname)
const { positionals, values } = parseArgs({ allowPositionals: true, options: { from: { type: 'string', default: 'build-s2' } } })
const [name, levelText, raw] = positionals
const level = Number(levelText)
assert.ok(/^[a-z0-9-]+$/.test(name ?? '') && level >= 1 && level <= 8 && raw, 'Usage: freeze.mjs NAME LEVEL JSON [--from BUILD]')
const source = resolve(HERE, values.from)
const overrides = JSON.parse(raw)
const file = level === 1 ? 'level1-final.json' : `level${level}-practice.json`
const config = { ...JSON.parse(readFileSync(join(source, file), 'utf8')), ...overrides }
const { Policy } = await import(join(source, 'policy.ts'))
new Policy({ roads: [], places: [] }, [], config, level)
const dir = join(HERE, 'rank', name)
assert.ok(!existsSync(dir), `${dir} already exists`)
mkdirSync(dir, { recursive: true })
symlinkSync(join(ROOT, 'reference'), join(dir, 'reference'))
const copied = readdirSync(source).filter(f => /\.(ts|json)$/.test(f) && !/\.test\.ts$/.test(f))
for (const f of copied) copyFileSync(join(source, f), join(dir, f))
writeFileSync(join(dir, file), JSON.stringify(config, null, 2) + '\n')
const files = {}
for (const f of [...copied, 'reference/typescript/spread.ts', 'reference/typescript/types.ts']) files[f] = createHash('sha256').update(readFileSync(join(dir, f))).digest('hex')
writeFileSync(join(dir, 'rank-build.json'), JSON.stringify({ level, name, frozenAt: new Date().toISOString(), from: values.from, overrides, files }, null, 2) + '\n')
console.log(dir)
