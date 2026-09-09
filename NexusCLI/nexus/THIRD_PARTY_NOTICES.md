# Third-party notices

## OpenCode architectural reference

Source: https://github.com/anomalyco/opencode and the local parent source snapshot (core manifest 1.18.29).

Nexus independently implements architectural ideas from SessionRunner, SessionRunCoordinator, SessionInput, SystemContextRegistry, ContextEpoch, ToolRegistry, ToolOutputStore and permission handling. No substantial implementation code was copied. This notice preserves provenance and the original license for reference and any future adaptation.

MIT License

Copyright (c) 2025 opencode

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Runtime and development dependencies

- Zod 4.1.8 — MIT, Colin McDonnell and contributors; runtime input/output schema validation.
- diff 8.0.2 — BSD-3-Clause, jsdiff contributors; recorded agent patches.
- Bun 1.3.14 — MIT with bundled third-party notices; runtime, SQLite, tests and compilation.
- TypeScript 5.8.2 — Apache-2.0, Microsoft; development type checking.
- @types/bun 1.3.13 — MIT, DefinitelyTyped contributors; development types.
- Prettier 3.6.2 — MIT, Prettier contributors; development formatting.

Full dependency licenses remain in the installed packages. Redistribution of a compiled executable must include licenses for its bundled dependencies and runtime; the source notices here do not replace those upstream license files.
