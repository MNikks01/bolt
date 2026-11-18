import ts from 'typescript';

const ELIDED = ' { … }';

/**
 * The file's API without its implementation: imports, types, interfaces and
 * enums verbatim; functions, methods, arrow functions and class members as
 * signatures with bodies elided. Enough for a model to call code it can't
 * see, at a fraction of the tokens.
 */
export function signatures(path: string, text: string): string {
  const kind = /\.tsx$/.test(path) ? ts.ScriptKind.TSX : /\.jsx$/.test(path) ? ts.ScriptKind.JSX : /\.m?js$|\.cjs$/.test(path) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  const out: string[] = [];
  const src = (n: ts.Node) => text.slice(n.getStart(sf), n.getEnd());
  const head = (n: ts.Node, body: ts.Node) => text.slice(n.getStart(sf), body.getStart(sf)).trimEnd() + ELIDED;

  function fn(n: ts.Node): string | undefined {
    if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isConstructorDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n)) && n.body) return head(n, n.body);
    return undefined;
  }

  function variable(stmt: ts.VariableStatement): string {
    const keyword = text.slice(stmt.getStart(sf), stmt.declarationList.declarations[0]!.getStart(sf)).trimEnd();
    const parts = stmt.declarationList.declarations.map((d) => {
      const init = d.initializer;
      const unwrapped = init && (ts.isAsExpression(init) || ts.isSatisfiesExpression(init) || ts.isParenthesizedExpression(init)) ? init.expression : init;
      // `const Foo = memo(() => …)` / `forwardRef(…)`: show the wrapped function's signature.
      const inner = unwrapped && ts.isCallExpression(unwrapped) && unwrapped.arguments[0] && (ts.isArrowFunction(unwrapped.arguments[0]) || ts.isFunctionExpression(unwrapped.arguments[0])) ? unwrapped.arguments[0] : unwrapped;
      if (inner && (ts.isArrowFunction(inner) || ts.isFunctionExpression(inner))) {
        return text.slice(d.getStart(sf), inner.body.getStart(sf)).trimEnd() + ELIDED;
      }
      if (!init) return src(d);
      const whole = src(d);
      return whole.length <= 160 ? whole : text.slice(d.getStart(sf), init.getStart(sf)) + '…';
    });
    return `${keyword} ${parts.join(', ')};`;
  }

  function cls(c: ts.ClassDeclaration): string {
    const lines = [text.slice(c.getStart(sf), c.members.pos).trimEnd().replace(/\{$/, '').trimEnd() + ' {'];
    for (const m of c.members) {
      if (ts.isPropertyDeclaration(m)) {
        const s = src(m);
        lines.push('  ' + (s.length <= 160 || !m.initializer ? s : text.slice(m.getStart(sf), m.initializer.getStart(sf)) + '…;'));
      } else lines.push('  ' + (fn(m) ?? src(m)));
    }
    lines.push('}');
    return lines.join('\n');
  }

  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) || ts.isExportDeclaration(stmt) || ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt) || ts.isEnumDeclaration(stmt) || ts.isModuleDeclaration(stmt)) {
      out.push(src(stmt));
    } else if (ts.isFunctionDeclaration(stmt)) {
      out.push(fn(stmt) ?? src(stmt));
    } else if (ts.isClassDeclaration(stmt)) {
      out.push(cls(stmt));
    } else if (ts.isVariableStatement(stmt)) {
      out.push(variable(stmt));
    } else if (ts.isExportAssignment(stmt)) {
      const s = src(stmt);
      out.push(s.length <= 160 ? s : 'export default …;');
    }
    // Top-level side effects (calls, ifs) are implementation, not API.
  }
  return out.join('\n');
}
