# Recruitment Feature

This feature implements the AI-assisted candidate evaluation workflow, including:

- Job requirements (must-have / nice-to-have)
- Candidate profiles and CV parsing metadata
- AI-assisted screening and interview guide generation
- Structured evaluations and decision reports
- Pre-boarding checklist storage

All business logic lives in `services.ts`, while server actions in `actions.ts` provide the mutation layer. Zod schemas in `schemas.ts` validate all inputs.
