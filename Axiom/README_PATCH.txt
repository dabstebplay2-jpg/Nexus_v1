Axiom v0.1.0-alpha.2 hardening patch

Changes:
1. Pre-aborted ChatCore.generate() is side-effect free.
2. Adds regression test for pre-aborted generation.
3. Adds safe source archive generator (allow-list based).
4. Adds npm scripts: release:source and pack:source.
5. Updates VERIFICATION.md test count and coverage notes.

Apply by copying this archive over the Axiom project root with replacement.
Then run on the supported Node version:
  npm run build:packages
  npm run lint
  npm run typecheck
  npm test
  npm run release:source
