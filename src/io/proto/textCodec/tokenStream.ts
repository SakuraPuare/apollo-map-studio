export interface Token {
  kind: 'identifier' | 'string' | 'number' | 'symbol';
  value: string;
}

export class TokenStream {
  private text: string;
  private pos = 0;
  private peeked: Token | null = null;

  constructor(text: string) {
    this.text = text;
  }

  peek(): Token | null {
    if (this.peeked) return this.peeked;
    this.peeked = this.next();
    return this.peeked;
  }

  consume(): Token | null {
    if (this.peeked) {
      const t = this.peeked;
      this.peeked = null;
      return t;
    }
    return this.next();
  }

  expect(kind: Token['kind'], value?: string): Token {
    const t = this.consume();
    if (!t) throw new Error(`Expected ${kind}${value ? ` "${value}"` : ''}, got EOF`);
    if (t.kind !== kind || (value !== undefined && t.value !== value)) {
      throw new Error(
        `Expected ${kind}${value ? ` "${value}"` : ''}, got ${t.kind} "${t.value}" near pos ${this.pos}`,
      );
    }
    return t;
  }

  position(): number {
    return this.pos;
  }

  private next(): Token | null {
    this.skipWhitespaceAndComments();
    if (this.pos >= this.text.length) return null;
    const c = this.text[this.pos]!;
    if (c === '"' || c === "'") return this.readString();
    if ('{}[]<>,:;'.includes(c)) {
      this.pos++;
      return { kind: 'symbol', value: c };
    }
    if (this.looksLikeNumber()) return this.readNumber();
    if (/[A-Za-z_]/.test(c)) return this.readIdentifier();
    throw new Error(`Unexpected character "${c}" at pos ${this.pos}`);
  }

  private skipWhitespaceAndComments(): void {
    for (;;) {
      const c = this.text[this.pos];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
        this.pos++;
      } else if (c === '#') {
        while (this.pos < this.text.length && this.text[this.pos] !== '\n') this.pos++;
      } else {
        break;
      }
    }
  }

  private looksLikeNumber(): boolean {
    const c = this.text[this.pos];
    if (c === undefined) return false;
    if (c >= '0' && c <= '9') return true;
    if (c === '.') {
      const n = this.text[this.pos + 1];
      return n !== undefined && n >= '0' && n <= '9';
    }
    if (c === '-' || c === '+') {
      const n = this.text[this.pos + 1];
      if (n === undefined) return false;
      if (n >= '0' && n <= '9') return true;
      if (n === '.') return true;
      if (this.text.slice(this.pos + 1, this.pos + 4) === 'inf') return true;
      if (this.text.slice(this.pos + 1, this.pos + 4) === 'nan') return true;
    }
    return false;
  }

  private readString(): Token {
    const quote = this.text[this.pos]!;
    this.pos++;
    let v = '';
    while (this.pos < this.text.length) {
      const c = this.text[this.pos]!;
      if (c === quote) {
        this.pos++;
        return { kind: 'string', value: v };
      }
      if (c === '\\') {
        this.pos++;
        const esc = this.text[this.pos]!;
        this.pos++;
        switch (esc) {
          case 'n':
            v += '\n';
            break;
          case 'r':
            v += '\r';
            break;
          case 't':
            v += '\t';
            break;
          case 'a':
            v += '\x07';
            break;
          case 'b':
            v += '\x08';
            break;
          case 'f':
            v += '\x0c';
            break;
          case 'v':
            v += '\x0b';
            break;
          case '"':
            v += '"';
            break;
          case "'":
            v += "'";
            break;
          case '\\':
            v += '\\';
            break;
          case '0':
          case '1':
          case '2':
          case '3':
          case '4':
          case '5':
          case '6':
          case '7': {
            let oct = esc;
            for (let i = 0; i < 2; i++) {
              const o = this.text[this.pos];
              if (o !== undefined && o >= '0' && o <= '7') {
                oct += o;
                this.pos++;
              } else break;
            }
            v += String.fromCharCode(parseInt(oct, 8));
            break;
          }
          case 'x':
          case 'X': {
            let hex = '';
            for (let i = 0; i < 2; i++) {
              const h = this.text[this.pos];
              if (h !== undefined && /[0-9a-fA-F]/.test(h)) {
                hex += h;
                this.pos++;
              } else break;
            }
            v += hex ? String.fromCharCode(parseInt(hex, 16)) : '';
            break;
          }
          default:
            v += esc;
        }
      } else {
        v += c;
        this.pos++;
      }
    }
    throw new Error('Unterminated string');
  }

  private readNumber(): Token {
    const start = this.pos;
    if (this.text[this.pos] === '-' || this.text[this.pos] === '+') this.pos++;
    if (this.text.slice(this.pos, this.pos + 3) === 'inf') {
      this.pos += 3;
      return { kind: 'number', value: this.text.slice(start, this.pos) };
    }
    if (this.text.slice(this.pos, this.pos + 3) === 'nan') {
      this.pos += 3;
      return { kind: 'number', value: this.text.slice(start, this.pos) };
    }
    while (this.pos < this.text.length && /[0-9.eE+\-xXa-fA-F]/.test(this.text[this.pos]!)) {
      this.pos++;
    }
    if (this.text[this.pos] === 'f' || this.text[this.pos] === 'F') this.pos++;
    return { kind: 'number', value: this.text.slice(start, this.pos) };
  }

  private readIdentifier(): Token {
    const start = this.pos;
    while (this.pos < this.text.length && /[A-Za-z0-9_]/.test(this.text[this.pos]!)) {
      this.pos++;
    }
    return { kind: 'identifier', value: this.text.slice(start, this.pos) };
  }
}
