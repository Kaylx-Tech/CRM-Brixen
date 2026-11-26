"""Catch backend mistakes that crash a page before they are committed (run by .git/hooks/pre-commit).

  python scripts/check_backend.py [files...]   (no files: every .py file under backend/)

Fails on:
  * a syntax error;
  * pyflakes' "undefined name" / "referenced before assignment" (a name used that is never imported or set);
  * a name imported at the top of a file, imported or set again inside a function and used in that function
    above that line: Python treats it as local to the WHOLE function, so the earlier use crashes
    (UnboundLocalError). This is
    how GET /api/settings/public broke on 2026-11-26 (workspace logo gone); pyflakes does not see it.
Other pyflakes notes (unused imports and the like) are not checked.
"""
import ast
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SERIOUS = ('undefined name', 'referenced before assignment', 'syntax error', 'invalid syntax',
           'unexpected indent', 'unindent does not match')


def module_names(tree):
    names = set()
    for node in tree.body:
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            for a in node.names:
                names.add((a.asname or a.name).split('.')[0])
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
    return names


def own_nodes(func):
    """The function's own statements and expressions, not those of functions/classes/lambdas inside it."""
    stack = list(func.body)
    while stack:
        node = stack.pop()
        yield node
        for child in ast.iter_child_nodes(node):
            if not isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)):
                stack.append(child)


def shadowed_imports(path, tree):
    top = module_names(tree)
    problems = []
    for func in ast.walk(tree):
        if not isinstance(func, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        nodes = list(own_nodes(func))
        declared = {n for node in nodes if isinstance(node, (ast.Global, ast.Nonlocal)) for n in node.names}
        bound = {}
        for node in nodes:
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                for a in node.names:
                    n = (a.asname or a.name).split('.')[0]
                    bound[n] = min(bound.get(n, node.lineno), node.lineno)
            elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
                bound[node.id] = min(bound.get(node.id, node.lineno), node.lineno)
        used = {node.id for node in nodes if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load)}
        for name, line in bound.items():
            if name in top and name in used and name not in declared:
                # used in the function above the line that makes it local: that use crashes
                first_use = min((n.lineno for n in nodes if isinstance(n, ast.Name) and n.id == name
                                 and isinstance(n.ctx, ast.Load)), default=line)
                if first_use >= line:
                    continue
                problems.append(f"{path}:{line}: '{name}' is set again inside {func.name}() although the file "
                                f"already imports/defines it at the top: every use of it in {func.name}() "
                                f"(first at line {first_use}) can crash with UnboundLocalError. Remove the inner "
                                f"import or use another name.")
    return problems


def main(argv):
    files = [Path(f) for f in argv if f.endswith('.py')] or sorted((ROOT / 'backend').rglob('*.py'))
    files = [f for f in files if f.exists() and 'node_modules' not in f.parts]
    if not files:
        return 0
    problems = []
    for f in files:
        try:
            tree = ast.parse(f.read_text(encoding='utf-8'), filename=str(f))
        except SyntaxError as exc:
            problems.append(f"{f}:{exc.lineno}: syntax error: {exc.msg}")
            continue
        problems += shadowed_imports(f, tree)
    try:
        out = subprocess.run([sys.executable, '-m', 'pyflakes', *map(str, files)],
                             capture_output=True, text=True).stdout + ''
        problems += [line for line in out.splitlines() if any(s in line for s in SERIOUS)]
    except Exception as exc:  # pyflakes missing: the checks above still ran
        print(f"(pyflakes not run: {exc})")
    if problems:
        print("Backend check found mistakes that would crash a page:\n  " + "\n  ".join(sorted(set(problems))))
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
