# Storefront implementation and acceptance

Orientation: 2026-10-29, feature/storefront, base 0a2d197. Sources: root AGENTS.md, docs/PRODUCT_BRIEF.md, docs/DESIGN_DIRECTION.md, docs/API_CONTRACT.md. This new storefront serves Guam locals, visitors, and Chamorro diaspora arriving mostly on phones. Core puzzles restock; numbered drops never restock. Money is USD cents; inventory and cross-order customer limits belong to the API. No existing web app or deployment to preserve. This worker changes only web/ and its CI workflow.

Design: Archivo, paper/ink tokens, square edges, artwork-led pages, restrained navigation. Cart and menu enter in 220ms to explain their position; reduced motion is immediate. Product gallery uses native scroll snapping. No decorative motion beyond the live state dot.

Acceptance / agent-executed comprehensive web QA: hero and collection; both product galleries; all drop states and Guam-first dates; cart focus/keyboard/limits; checkout payment and cancellation recovery; order polling; signup validation/idempotency; empty archive and 404; layout at 390×844 and 1440×900 plus 320px overflow. Fixtures use the local MSW seed and no external payment or email services. Real Postgres concurrency and Rails integration belong to the API/integration lead. Real hardware touch feel and production performance are outside this browser-emulation check.

Execution evidence and final gate results are appended after implementation.
