"""Computer Vision service package for the AI Interview Monitoring system.

Phase 13 — Computer Vision

Responsible for:
- Frame preprocessing and quality assessment (CV-SIG-006)
- Face presence detection (CV-SIG-001)
- Multiple-face detection (CV-SIG-002)
- Face absence tracking (CV-SIG-003)
- Structured CV observation output

This package intentionally does NOT:
- Identify individuals (no facial recognition / no identity embeddings)
- Classify behaviour as suspicious
- Generate cheating/fraud scores
- Persist raw frame images

Downstream phases consume these structured observations:
- Phase 14: Observable Behaviour Signals
- Phase 15: Event Engine & Persistence
"""

