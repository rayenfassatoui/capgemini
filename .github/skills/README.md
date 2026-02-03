# Agent Skills for GitHub Copilot in VS Code

## What Are Agent Skills?

**Agent Skills** are specialized knowledge files that provide detailed, context-specific guidance to GitHub Copilot when working on particular types of tasks. They act as "expert consultants" that the AI can reference for domain-specific best practices, patterns, and standards.

## How Agent Skills Work in VS Code

### Architecture

```
.github/skills/
├── react-best-practices.md      # React & Next.js optimization
├── web-design-guidelines.md     # UI/UX & accessibility
├── nextjs-patterns.md           # Next.js App Router patterns
└── README.md                    # This file
```

### Loading Mechanism

1. **On-Demand Loading**: Skills are loaded automatically when GitHub Copilot detects relevant context
2. **Contextual Activation**: Based on file types, imports, or explicit user prompts
3. **Priority System**: More specific skills take precedence over general ones

### Example Workflow

```mermaid
User Request → Copilot Analyzes Context → Loads Relevant Skills → Generates Response
```

## Creating Agent Skills

### File Structure

Each skill file follows this structure:

```markdown
---
description: Brief description of the skill
triggers:
  - file patterns (e.g., *.tsx, features/**/components/*.tsx)
  - keywords (e.g., "performance", "accessibility")
priority: 1-10 (higher = more important)
---

# Skill Name

## Overview
[Clear explanation of what this skill covers]

## When to Use
[Specific scenarios where this skill applies]

## Best Practices
[Detailed guidelines and patterns]

## Examples
[Code examples with explanations]

## Anti-Patterns
[Common mistakes to avoid]

## References
[External resources and documentation]
```

### Best Practices for Writing Skills

1. **Be Specific**: Focus on one domain or concept per skill
2. **Include Examples**: Show concrete code patterns
3. **Explain Why**: Don't just say what to do, explain the reasoning
4. **Keep Updated**: Maintain skills as technologies evolve
5. **Use Metadata**: Properly configure triggers and priority

## Skill Types

### 1. Technical Skills
Focus on specific technologies or frameworks
- React best practices
- TypeScript patterns
- Database optimization
- API design

### 2. Architectural Skills
Guide system design decisions
- Feature-driven architecture
- Microservices patterns
- State management strategies
- Testing approaches

### 3. Domain Skills
Business or project-specific knowledge
- Company coding standards
- Project-specific patterns
- Team conventions
- Domain models

### 4. Quality Skills
Code quality and standards
- Code review guidelines
- Performance optimization
- Security best practices
- Accessibility requirements

## Using Agent Skills

### Implicit Activation

Skills activate automatically based on context:

```typescript
// Working in features/*/components/*.tsx
// → Automatically loads react-best-practices.md

// Working on responsive design
// → Automatically loads web-design-guidelines.md
```

### Explicit Invocation

Reference skills in your prompts:

```
"Following our react-best-practices skill, refactor this component"

"Apply our web-design-guidelines to this layout"

"Use the nextjs-patterns skill to implement this feature"
```

### Priority System

Skills have priority levels (1-10):
- **High (8-10)**: Project-specific, always apply
- **Medium (4-7)**: Framework-specific, contextual
- **Low (1-3)**: General guidelines, background knowledge

## Current Project Skills

### 1. react-best-practices
**Triggers**: `*.tsx`, `*.jsx`, `components/`, `features/`  
**Priority**: 8  
**Covers**:
- React Server Components vs Client Components
- Performance optimization (memo, useMemo, useCallback)
- Hooks best practices
- State management patterns
- Component composition

### 2. web-design-guidelines
**Triggers**: Design-related keywords, UI components  
**Priority**: 7  
**Covers**:
- Intentional Minimalism philosophy
- Typography and spacing
- Responsive design
- Dark mode support
- Accessibility (WCAG AA+)

### 3. nextjs-patterns
**Triggers**: `app/`, `features/`, Next.js specific files  
**Priority**: 9  
**Covers**:
- App Router architecture
- Server Actions patterns
- Data fetching strategies
- Route organization
- Feature-driven structure

## Benefits of Agent Skills

### For Development

1. **Consistency**: Ensures all code follows the same patterns
2. **Knowledge Sharing**: Captures team expertise in reusable form
3. **Onboarding**: New developers get instant access to best practices
4. **Quality**: Reduces bugs by promoting proven patterns

### For AI Assistance

1. **Context-Aware**: Copilot understands your specific standards
2. **Accurate**: Suggestions match your actual codebase patterns
3. **Comprehensive**: Can reference detailed examples and edge cases
4. **Evolving**: Skills grow with your project

## Advanced Features

### Skill Composition

Skills can reference other skills:

```markdown
## Related Skills
- See [react-best-practices] for component patterns
- See [web-design-guidelines] for styling standards
```

### Conditional Application

Skills can define conditions:

```yaml
conditions:
  - file_pattern: "features/*/components/*.tsx"
  - not: "*.test.tsx"
  - has_import: "next/navigation"
```

### Version Tracking

Track skill versions for auditing:

```yaml
version: 1.2.0
last_updated: 2026-02-03
authors:
  - Team Lead
  - Senior Developer
```

## Maintenance

### Regular Updates

- **Monthly**: Review and update for new patterns
- **After Major Changes**: Update when architecture changes
- **Community Input**: Incorporate team feedback

### Metrics to Track

1. **Usage Frequency**: Which skills are used most?
2. **Effectiveness**: Do they improve code quality?
3. **Coverage**: Are all domains covered?
4. **Relevance**: Are suggestions accurate?

## Integration with Other Tools

### VS Code Extensions

Works with:
- GitHub Copilot
- GitHub Copilot Chat
- VS Code Workspace Settings

### CI/CD Integration

Can be referenced in:
- Code review checklists
- Automated linting rules
- Documentation generation

## Troubleshooting

### Skill Not Loading

1. Check file location: Must be in `.github/skills/`
2. Verify markdown format
3. Check trigger patterns
4. Ensure proper frontmatter

### Conflicting Skills

1. Adjust priority levels
2. Make triggers more specific
3. Use conditional application

### Outdated Information

1. Set up review schedule
2. Use version tracking
3. Document deprecations

## Example: Creating a New Skill

```bash
# 1. Create skill file
touch .github/skills/database-patterns.md

# 2. Add frontmatter
---
description: Database patterns and best practices with Drizzle ORM
triggers:
  - "**/*services.ts"
  - "db/schema.ts"
  - keywords: ["database", "query", "drizzle"]
priority: 8
---

# 3. Add content
[Your detailed guidelines]

# 4. Test
[Create a services.ts file and see if skill activates]
```

## Best Practices Summary

✅ **DO**:
- Keep skills focused and specific
- Include real code examples
- Explain the reasoning behind patterns
- Update regularly
- Use clear, actionable language

❌ **DON'T**:
- Create overly broad skills
- Include outdated information
- Duplicate content across skills
- Make skills too long (>500 lines)
- Forget to set appropriate priority

## Resources

### Official Documentation
- [GitHub Copilot Documentation](https://docs.github.com/copilot)
- [VS Code Copilot API](https://code.visualstudio.com/api/extension-guides/copilot)

### Community Resources
- [Best Practices Repository](https://github.com/features/copilot)
- [Skill Templates](https://github.com/copilot-skills/templates)

### Internal Resources
- [agents.md](../../agents.md) - Main agent configuration
- [ARCHITECTURE.md](../../ARCHITECTURE.md) - Project architecture guide

---

**Remember**: Agent Skills are living documents. They should evolve with your project and team's understanding. Treat them as part of your codebase, with the same care and attention to quality.
