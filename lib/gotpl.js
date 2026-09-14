/**
 * Go text/template 子集解释器
 * 支持：{{.Path}} {{$.Path}} {{$var}} {{$var := Path}} {{if}}/{{else if}}/{{else}}/{{end}}
 *       {{range $v := X}} {{range $i, $v := X}} {{eq/ne/lt/gt/le/ge}} {{not/and/or}} {{len}} {{printf}}
 * 语义对齐 Go：nil/空串/0/空数组/空map 为假；路径访问 nil 安全；text/template 不做 HTML 转义
 */

function goTruthy (v) {
  if (v === undefined || v === null || v === false) return false
  if (v === '') return false
  if (typeof v === 'number') return v !== 0
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v).length > 0
  return true
}

/** nil 安全取路径 */
function getPath (obj, path) {
  let cur = obj
  for (const key of path) {
    if (cur === undefined || cur === null) return undefined
    cur = cur[key]
  }
  return cur
}

function goEq (a, b) {
  if (a === b) return true
  // Go 基本类型比较：数字松散比较（JSON 数字均为 float64）
  if (typeof a === 'number' || typeof b === 'number') {
    const na = Number(a); const nb = Number(b)
    return !Number.isNaN(na) && !Number.isNaN(nb) && na === nb
  }
  return String(a) === String(b)
}

function toNum (v) {
  const n = Number(v)
  if (Number.isNaN(n)) return 0
  return n
}

const cmpOps = {
  eq: (a, b) => goEq(a, b),
  ne: (a, b) => !goEq(a, b),
  lt: (a, b) => toNum(a) < toNum(b),
  le: (a, b) => toNum(a) <= toNum(b),
  gt: (a, b) => toNum(a) > toNum(b),
  ge: (a, b) => toNum(a) >= toNum(b),
}

/** printf 简易实现（覆盖 %s %d %v %.Nf %x 等常用格式） */
function goPrintf (fmt, ...args) {
  let i = 0
  return String(fmt).replace(/%(-?\d+)?(?:\.(\d+))?([sdvfxXobq%])/g, (m, width, prec, verb) => {
    if (verb === '%') return '%'
    let arg = args[i++]
    if (arg === undefined || arg === null) arg = verb === 'd' || verb === 'f' || verb === 'x' || verb === 'X' ? 0 : '<nil>'
    let out
    switch (verb) {
      case 's': out = String(arg); break
      case 'q': out = JSON.stringify(String(arg)); break
      case 'd': out = String(Math.round(toNum(arg))); break
      case 'f': {
        const p = prec === undefined ? 6 : parseInt(prec)
        out = toNum(arg).toFixed(p)
        break
      }
      case 'x': out = Math.round(toNum(arg)).toString(16); break
      case 'X': out = Math.round(toNum(arg)).toString(16).toUpperCase(); break
      case 'o': out = Math.round(toNum(arg)).toString(8); break
      case 'b': out = Math.round(toNum(arg)).toString(2); break
      default: out = typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    }
    if (width) {
      const w = parseInt(width.replace('-', ''))
      if (width.startsWith('-')) out = out.padEnd(w)
      else out = out.padStart(w)
    }
    return out
  })
}

/* ============ 词法 ============ */

function lex (tpl) {
  const tokens = []
  let pos = 0
  while (pos < tpl.length) {
    const start = tpl.indexOf('{{', pos)
    if (start < 0) {
      if (pos < tpl.length) tokens.push({ type: 'text', text: tpl.slice(pos) })
      break
    }
    if (start > pos) tokens.push({ type: 'text', text: tpl.slice(pos, start) })
    const action = tpl.indexOf('}}', start)
    if (action < 0) throw new Error('gotpl: 未闭合的 {{')
    let body = tpl.slice(start + 2, action)
    let trimL = body.startsWith('-')
    let trimR = body.endsWith('-') && body.length > 1
    if (trimL) body = body.slice(1)
    if (trimR) body = body.slice(0, -1)
    body = body.trim()
    if (trimL) {
      const last = tokens[tokens.length - 1]
      if (last && last.type === 'text') last.text = last.text.replace(/\s+$/, '')
    }
    tokens.push({ type: 'action', body })
    pos = action + 2
    if (trimR) {
      while (pos < tpl.length && /\s/.test(tpl[pos])) pos++
    }
  }
  return tokens
}

/* ============ 表达式解析 ============ */

function tokenizeExpr (s) {
  const toks = []
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) { i++; continue }
    if (c === '(' || c === ')' || c === ',') { toks.push({ t: c }); i++; continue }
    if (c === '"') {
      let j = i + 1; let str = ''
      while (j < s.length && s[j] !== '"') {
        if (s[j] === '\\') { str += s[j + 1]; j += 2 } else { str += s[j]; j++ }
      }
      toks.push({ t: 'str', v: str })
      i = j + 1
      continue
    }
    if (c === '`') {
      const j = s.indexOf('`', i + 1)
      toks.push({ t: 'str', v: s.slice(i + 1, j) })
      i = j + 1
      continue
    }
    // $var 或 $var.path 或 .Root.path
    const m = /^(\$[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*|\$\.[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*|\$|\.[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)/.exec(s.slice(i))
    if (m) {
      toks.push({ t: 'path', v: m[1] })
      i += m[1].length
      continue
    }
    if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(s[i + 1] || ''))) {
      const m2 = /^-?[0-9]+(?:\.[0-9]+)?/.exec(s.slice(i))
      toks.push({ t: 'num', v: parseFloat(m2[0]) })
      i += m2[0].length
      continue
    }
    const ident = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i))
    if (ident) { toks.push({ t: 'ident', v: ident[0] }); i += ident[0].length; continue }
    // := 赋值
    if (s.slice(i, i + 2) === ':=') { toks.push({ t: ':=' }); i += 2; continue }
    throw new Error('gotpl: 无法解析表达式片段: ' + s.slice(i, i + 20))
  }
  return toks
}

/** 解析路径 token 为访问器 */
function parsePathToken (v) {
  if (v === '$') return { kind: 'root', path: [] }
  if (v.startsWith('$.')) return { kind: 'root', path: v.slice(2).split('.') }
  if (v.startsWith('$')) {
    const parts = v.slice(1).split('.')
    return { kind: 'var', name: parts[0], path: parts.slice(1) }
  }
  return { kind: 'root', path: v.slice(1).split('.') }
}

class ExprParser {
  constructor (toks) { this.toks = toks; this.i = 0 }
  peek () { return this.toks[this.i] }
  next () { return this.toks[this.i++] }

  /** 解析完整表达式（含函数调用） */
  parseExpr () {
    const tok = this.next()
    if (!tok) throw new Error('gotpl: 表达式为空')
    if (tok.t === 'str') return { kind: 'lit', v: tok.v }
    if (tok.t === 'num') return { kind: 'lit', v: tok.v }
    if (tok.t === 'path') {
      const p = parsePathToken(tok.v)
      // 变量赋值: $var := expr
      if (p.kind === 'var' && p.path.length === 0 && this.peek()?.t === ':=') {
        this.next()
        return { kind: 'assign', name: p.name, expr: this.parseExpr() }
      }
      return p
    }
    if (tok.t === 'ident') {
      if (tok.v === 'not') return { kind: 'not', arg: this.parsePrimary() }
      if (tok.v === 'len') return { kind: 'len', arg: this.parsePrimary() }
      if (['eq', 'ne', 'lt', 'le', 'gt', 'ge', 'and', 'or', 'printf', 'print'].includes(tok.v)) {
        const args = []
        while (this.peek() && this.peek().t !== ')' && this.peek().t !== ':=') args.push(this.parsePrimary())
        return { kind: 'func', name: tok.v, args }
      }
      throw new Error('gotpl: 不支持的函数 ' + tok.v)
    }
    if (tok.t === '(') {
      const e = this.parseExpr()
      if (this.peek()?.t === ')') this.next()
      return e
    }
    throw new Error('gotpl: 意外 token ' + JSON.stringify(tok))
  }

  /** 主元：路径/字面量/括号表达式/函数调用 */
  parsePrimary () {
    const tok = this.next()
    if (!tok) throw new Error('gotpl: 参数缺失')
    if (tok.t === 'str') return { kind: 'lit', v: tok.v }
    if (tok.t === 'num') return { kind: 'lit', v: tok.v }
    if (tok.t === 'path') return parsePathToken(tok.v)
    if (tok.t === '(') {
      const e = this.parseExpr()
      if (this.peek()?.t === ')') this.next()
      return e
    }
    if (tok.t === 'ident') {
      if (tok.v === 'not') return { kind: 'not', arg: this.parsePrimary() }
      if (tok.v === 'len') return { kind: 'len', arg: this.parsePrimary() }
      if (['eq', 'ne', 'lt', 'le', 'gt', 'ge', 'and', 'or', 'printf', 'print'].includes(tok.v)) {
        const args = []
        while (this.peek() && this.peek().t !== ')' && this.peek().t !== ':=') args.push(this.parsePrimary())
        return { kind: 'func', name: tok.v, args }
      }
      throw new Error('gotpl: 不支持的函数 ' + tok.v)
    }
    throw new Error('gotpl: 意外参数 token ' + JSON.stringify(tok))
  }
}

/* ============ 动作解析 → AST ============ */

function parseBody (tokens, idx, stops) {
  const nodes = []
  while (idx < tokens.length) {
    const tk = tokens[idx]
    if (tk.type === 'text') { nodes.push({ kind: 'text', text: tk.text }); idx++; continue }
    const body = tk.body
    if (stops.includes(body)) return { nodes, idx, stop: body }
    if (body.startsWith('else')) {
      if (stops.includes('else') && body === 'else') return { nodes, idx, stop: 'else' }
      if (body.startsWith('else if ') && stops.includes('else if')) return { nodes, idx, stop: 'else if' }
      throw new Error('gotpl: 意外的 ' + body)
    }
    if (body === 'end') throw new Error('gotpl: 意外的 end')
    idx++
    if (body.startsWith('if ')) {
      const expr = new ExprParser(tokenizeExpr(body.slice(3))).parseExpr()
      const r1 = parseBody(tokens, idx, ['end', 'else', 'else if'])
      const branches = [{ cond: expr, body: r1.nodes }]
      let cur = r1
      while (cur.stop === 'else if') {
        const condBody = tokens[cur.idx].body
        const cond = new ExprParser(tokenizeExpr(condBody.slice('else if '.length))).parseExpr()
        const r = parseBody(tokens, cur.idx + 1, ['end', 'else', 'else if'])
        branches.push({ cond, body: r.nodes })
        cur = r
      }
      if (cur.stop === 'else') {
        const r2 = parseBody(tokens, cur.idx + 1, ['end'])
        nodes.push({ kind: 'if', branches, elseBody: r2.nodes })
        idx = r2.idx + 1
      } else {
        nodes.push({ kind: 'if', branches, elseBody: null })
        idx = cur.idx + 1
      }
      continue
    }
    if (body.startsWith('range ')) {
      const p = new ExprParser(tokenizeExpr(body.slice(6)))
      const first = p.next()
      if (!first || first.t !== 'path') throw new Error('gotpl: range 语法错误')
      let indexVar = null; let valueVar
      if (p.peek()?.t === ',') {
        p.next()
        const second = p.next()
        indexVar = parsePathToken(first.v).name
        valueVar = parsePathToken(second.v).name
      } else {
        valueVar = parsePathToken(first.v).name
      }
      if (p.peek()?.t !== ':=') throw new Error('gotpl: range 缺少 :=')
      p.next()
      const expr = p.parseExpr()
      const r = parseBody(tokens, idx, ['end', 'else'])
      nodes.push({ kind: 'range', indexVar, valueVar, expr, body: r.nodes })
      idx = r.idx + 1
      continue
    }
    // 输出/赋值
    const expr = new ExprParser(tokenizeExpr(body)).parseExpr()
    nodes.push({ kind: 'output', expr })
  }
  if (stops.length) throw new Error('gotpl: 缺少 ' + stops.join('/'))
  return { nodes, idx, stop: null }
}

/* ============ 执行 ============ */

function evalExpr (expr, ctx) {
  switch (expr.kind) {
    case 'lit': return expr.v
    case 'root': return getPath(ctx.root, expr.path)
    case 'var': return getPath(ctx.vars[expr.name], expr.path)
    case 'not': return !goTruthy(evalExpr(expr.arg, ctx))
    case 'len': {
      const v = evalExpr(expr.arg, ctx)
      if (Array.isArray(v)) return v.length
      if (typeof v === 'string') return v.length
      if (v && typeof v === 'object') return Object.keys(v).length
      return 0
    }
    case 'func': {
      const args = expr.args.map(a => evalExpr(a, ctx))
      if (expr.name === 'printf') return goPrintf(args[0], ...args.slice(1))
      if (expr.name === 'print') return args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join('')
      if (expr.name === 'and') return args.find(a => !goTruthy(a)) ?? args[args.length - 1]
      if (expr.name === 'or') return args.find(a => goTruthy(a))
      if (cmpOps[expr.name]) return cmpOps[expr.name](args[0], args[1])
      throw new Error('gotpl: 未知函数 ' + expr.name)
    }
    case 'assign': {
      const v = evalExpr(expr.expr, ctx)
      ctx.vars[expr.name] = v ?? null
      return ''
    }
    default:
      throw new Error('gotpl: 未知表达式 ' + expr.kind)
  }
}

function renderValue (v) {
  if (v === undefined || v === null) return ''
  if (v === true) return 'true'
  if (v === false) return 'false'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function execNodes (nodes, ctx, out) {
  for (const node of nodes) {
    switch (node.kind) {
      case 'text':
        out.push(node.text)
        break
      case 'output': {
        const v = evalExpr(node.expr, ctx)
        if (node.expr.kind !== 'assign') out.push(renderValue(v))
        break
      }
      case 'if': {
        let done = false
        for (const br of node.branches) {
          if (goTruthy(evalExpr(br.cond, ctx))) {
            execNodes(br.body, ctx, out)
            done = true
            break
          }
        }
        if (!done && node.elseBody) execNodes(node.elseBody, ctx, out)
        break
      }
      case 'range': {
        const v = evalExpr(node.expr, ctx)
        const list = Array.isArray(v) ? v
          : v && typeof v === 'object' ? Object.values(v)
            : typeof v === 'number' ? [] : []
        if (Array.isArray(v) && v.length === 0) break
        if (!Array.isArray(v) && (v === undefined || v === null || v === '' || v === 0)) break
        list.forEach((item, i) => {
          if (node.indexVar) ctx.vars[node.indexVar] = i
          ctx.vars[node.valueVar] = item
          execNodes(node.body, ctx, out)
        })
        break
      }
    }
  }
}

/**
 * 渲染 Go template
 * @param {string} tpl 模板字符串
 * @param {object} data 根数据（对应 Go 的 . ）
 */
export function renderGoTpl (tpl, data) {
  const tokens = lex(tpl)
  const { nodes } = parseBody(tokens, 0, [])
  const ctx = { root: data, vars: {} }
  const out = []
  execNodes(nodes, ctx, out)
  return out.join('')
}
