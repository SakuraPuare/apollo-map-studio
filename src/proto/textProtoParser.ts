/**
 * Minimal protobuf text-format parser.
 *
 * Converts a proto text representation like:
 *   header {
 *     version: "1.0"
 *   }
 *   crosswalk { id { id: "cw1" } }
 *
 * into a plain JavaScript object with camelCase keys:
 *   { header: { version: "1.0" }, crosswalk: [{ id: { id: "cw1" } }] }
 *
 * Repeated fields (same name appearing multiple times at the same level)
 * are automatically collected into arrays.
 */

export type TextProtoValue = string | number | boolean | TextProtoObject | TextProtoValue[]
export type TextProtoObject = Record<string, TextProtoValue>

// ── Tokeniser ──────────────────────────────────────────────────────

const enum TT {
  Ident,
  String,
  Number,
  Colon,
  LBrace,
  RBrace,
}

type Token =
  | { t: TT.Ident; v: string }
  | { t: TT.String; v: string }
  | { t: TT.Number; v: number }
  | { t: TT.Colon }
  | { t: TT.LBrace }
  | { t: TT.RBrace }

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const len = text.length

  while (i < len) {
    const ch = text[i]

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++
      continue
    }

    // Line comment
    if (ch === '#') {
      while (i < len && text[i] !== '\n') i++
      continue
    }

    // Punctuation
    if (ch === ':') {
      tokens.push({ t: TT.Colon })
      i++
      continue
    }
    if (ch === '{') {
      tokens.push({ t: TT.LBrace })
      i++
      continue
    }
    if (ch === '}') {
      tokens.push({ t: TT.RBrace })
      i++
      continue
    }

    // String literal
    if (ch === '"' || ch === "'") {
      const quote = ch
      i++
      let s = ''
      while (i < len && text[i] !== quote) {
        if (text[i] === '\\' && i + 1 < len) {
          i++
          switch (text[i]) {
            case 'n':
              s += '\n'
              break
            case 't':
              s += '\t'
              break
            case 'r':
              s += '\r'
              break
            case '"':
              s += '"'
              break
            case "'":
              s += "'"
              break
            case '\\':
              s += '\\'
              break
            default:
              s += text[i]
          }
        } else {
          s += text[i]
        }
        i++
      }
      if (i < len) i++ // closing quote
      tokens.push({ t: TT.String, v: s })
      continue
    }

    // Numeric literal (possibly negative)
    if (
      (ch >= '0' && ch <= '9') ||
      ch === '.' ||
      (ch === '-' &&
        i + 1 < len &&
        ((text[i + 1] >= '0' && text[i + 1] <= '9') || text[i + 1] === '.'))
    ) {
      let word = ''
      if (ch === '-') {
        word += '-'
        i++
      }
      while (
        i < len &&
        ((text[i] >= '0' && text[i] <= '9') ||
          text[i] === '.' ||
          text[i] === 'e' ||
          text[i] === 'E' ||
          text[i] === '+' ||
          text[i] === '-')
      ) {
        // prevent double-sign unless after e/E
        if (
          (text[i] === '+' || text[i] === '-') &&
          word.length > 0 &&
          word[word.length - 1] !== 'e' &&
          word[word.length - 1] !== 'E'
        )
          break
        word += text[i]
        i++
      }
      tokens.push({ t: TT.Number, v: parseFloat(word) })
      continue
    }

    // Identifier / enum / boolean
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      let word = ''
      while (
        i < len &&
        ((text[i] >= 'a' && text[i] <= 'z') ||
          (text[i] >= 'A' && text[i] <= 'Z') ||
          (text[i] >= '0' && text[i] <= '9') ||
          text[i] === '_')
      ) {
        word += text[i]
        i++
      }
      tokens.push({ t: TT.Ident, v: word })
      continue
    }

    // Semicolons are optional terminators in text proto – skip them
    if (ch === ';') {
      i++
      continue
    }

    // Skip any other character (e.g. stray commas)
    i++
  }

  return tokens
}

// ── Parser ─────────────────────────────────────────────────────────

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

/**
 * Parse a protobuf text-format string into a plain JavaScript object.
 * Field names are converted from snake_case to camelCase to match
 * protobufjs's default output.
 */
export function parseTextProto(text: string): TextProtoObject {
  const tokens = tokenize(text)
  let pos = 0

  function peek(): Token | undefined {
    return tokens[pos]
  }
  function next(): Token {
    return tokens[pos++]
  }

  function parseMessage(): TextProtoObject {
    const result: TextProtoObject = {}

    while (pos < tokens.length) {
      const tok = peek()
      if (!tok || tok.t === TT.RBrace) break

      if (tok.t !== TT.Ident) {
        throw new SyntaxError(`Expected field name, got token type ${tok.t} at position ${pos}`)
      }
      const fieldName = snakeToCamel((next() as { t: TT.Ident; v: string }).v)

      let value: TextProtoValue
      const after = peek()

      if (after && after.t === TT.LBrace) {
        // Nested message: field { ... }
        next() // consume '{'
        value = parseMessage()
        if (!peek() || peek()!.t !== TT.RBrace) {
          throw new SyntaxError(`Expected '}' at position ${pos}`)
        }
        next() // consume '}'
      } else if (after && after.t === TT.Colon) {
        // Scalar: field: value
        next() // consume ':'
        const vTok = next()
        if (vTok.t === TT.String) {
          value = vTok.v
        } else if (vTok.t === TT.Number) {
          value = vTok.v
        } else if (vTok.t === TT.Ident) {
          if (vTok.v === 'true') value = true
          else if (vTok.v === 'false') value = false
          else value = vTok.v // enum literal
        } else {
          throw new SyntaxError(
            `Expected value after ':', got token type ${vTok.t} at position ${pos - 1}`
          )
        }
      } else {
        throw new SyntaxError(
          `Expected ':' or '{' after field name "${fieldName}", got ${after ? `token type ${after.t}` : 'end of input'} at position ${pos}`
        )
      }

      // Collect repeated fields into arrays
      if (fieldName in result) {
        const existing = result[fieldName]
        if (Array.isArray(existing)) {
          existing.push(value)
        } else {
          result[fieldName] = [existing, value]
        }
      } else {
        result[fieldName] = value
      }
    }

    return result
  }

  return parseMessage()
}
