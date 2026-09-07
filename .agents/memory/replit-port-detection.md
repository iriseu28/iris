---
name: Replit port detection
description: Environment behavior observed when running local frontend and backend listeners during verification.
---

Running local servers on supported ports can cause the Replit environment to automatically add port mappings and a Node module declaration to `.replit`. These entries are environment conveniences, not application architecture.

**Why:** Phase 2 requires portability and the repository's `.replit` file should not accumulate incidental service mappings from one verification session.

**How to apply:** After local runtime verification, inspect `.replit` and restore only the intentional project port configuration before finishing.