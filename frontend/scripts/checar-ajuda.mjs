// Lista rotas de app/ que não têm ajuda em content/ajuda (manual embutido, 2026-10-29).
// Uso: npm run ajuda:checar  (também roda sem node_modules — só fs/path)
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const APP = join(RAIZ, 'app')
const CONGELADAS = [/^\/etiquetador/, /^\/pedidos/, /^\/ajuda/]   // congelados + o próprio manual

function rotas(dir) {
  const out = []
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) out.push(...rotas(p))
    else if (nome === 'page.tsx') {
      const rel = relative(APP, dir).split(sep).filter((s) => !/^\(.*\)$/.test(s))
      out.push('/' + rel.join('/'))
    }
  }
  return out
}

const indice = readFileSync(join(RAIZ, 'content', 'ajuda', 'index.ts'), 'utf8')
const arquivos = [...indice.matchAll(/from '\.\/([^']+)'/g)].map((m) => m[1]).filter((n) => n !== 'tipos')
const rotasComAjuda = arquivos.map((a) => {
  const src = readFileSync(join(RAIZ, 'content', 'ajuda', `${a}.ts`), 'utf8')
  const rota = src.match(/rota:\s*'([^']+)'/)?.[1]
  const rascunho = /RASCUNHO/.test(src) || /resumo:\s*''/.test(src)
  return { a, rota, rascunho }
})

const todas = rotas(APP).filter((r) => r !== '/' && !CONGELADAS.some((re) => re.test(r)))
const sem = todas.filter((r) => !rotasComAjuda.some((x) => x.rota === r))
const rascunhos = rotasComAjuda.filter((x) => x.rascunho)

console.log(`${todas.length} rotas · ${rotasComAjuda.length} com ajuda · ${sem.length} sem · ${rascunhos.length} em rascunho`)
for (const r of sem) console.log('  SEM AJUDA  ', r)
for (const x of rascunhos) console.log('  RASCUNHO   ', x.rota, `(${x.a}.ts)`)
process.exitCode = sem.length ? 1 : 0
