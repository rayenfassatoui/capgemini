---
description: UI/UX design guidelines, accessibility, and intentional minimalism
triggers:
  - "app/**/*.tsx"
  - "components/**/*.tsx"
  - "features/**/components/**/*.tsx"
  - keywords: ["design", "ui", "ux", "accessibility", "responsive"]
priority: 7
version: 1.0.0
last_updated: 2026-02-03
---

# Web Design Guidelines

## Overview

This skill defines our design philosophy of "Intentional Minimalism" and provides guidelines for creating modern, accessible, and elegant user interfaces.

## Core Design Philosophy: Intentional Minimalism

### Principles

1. **Anti-Generic**: Reject standard "bootstrapped" layouts
2. **Purpose-Driven**: Every element must justify its existence
3. **Whitespace Mastery**: Use whitespace as a design element
4. **Visual Hierarchy**: Clear importance signaling
5. **Modern & Elegant**: "Wow factor" without sacrificing usability

---

## Typography

### Font Usage

```typescript
// ✅ GOOD: Strategic font usage
<div>
  {/* Default: Inter (font-sans) for body text */}
  <p className="font-sans text-base text-gray-700">
    Most content uses Inter for readability
  </p>
  
  {/* Accent: Instrument Serif (font-serif) for emphasis */}
  <h1 className="font-serif text-4xl text-gradient">
    Premium Headline
  </h1>
</div>
```

### Typography Scale

```typescript
// ✅ GOOD: Consistent typography scale
<div>
  <h1 className="text-5xl font-bold">      {/* 48px */}</h1>
  <h2 className="text-4xl font-bold">      {/* 36px */}</h2>
  <h3 className="text-3xl font-semibold">  {/* 30px */}</h3>
  <h4 className="text-2xl font-semibold">  {/* 24px */}</h4>
  <h5 className="text-xl font-semibold">   {/* 20px */}</h5>
  <p className="text-base">                {/* 16px */}</p>
  <small className="text-sm">             {/* 14px */}</small>
</div>
```

### Rules

- Use `font-serif` **sparingly** (headlines, single words)
- Combine `font-serif` with `text-gradient` for premium feel
- Never use more than 2 font families
- Maintain consistent font weights

---

## Color System

### Brand Gradients

```typescript
// ✅ GOOD: Use utility classes (never hardcode gradients)
<div>
  {/* Text gradient */}
  <h1 className="text-gradient">Brand Headline</h1>
  
  {/* Background gradient */}
  <div className="bg-gradient">Brand Section</div>
  
  {/* Hover effect with gradient */}
  <div className="group">
    <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient opacity-0 transition-opacity group-hover:opacity-100" />
  </div>
</div>
```

### Color Palette

```typescript
// ✅ GOOD: Semantic color usage
<div>
  {/* Text colors */}
  <p className="text-gray-900 dark:text-white">Primary text</p>
  <p className="text-gray-600 dark:text-gray-400">Secondary text</p>
  <p className="text-gray-500 dark:text-gray-500">Muted text</p>
  
  {/* Background colors */}
  <div className="bg-white dark:bg-gray-950">Surface</div>
  <div className="bg-gray-50 dark:bg-gray-900">Subtle background</div>
  <div className="bg-gray-100 dark:bg-gray-800">Interactive element</div>
  
  {/* Border colors */}
  <div className="border border-gray-200 dark:border-gray-800">Card</div>
</div>
```

---

## Spacing System

### Consistent Spacing

```typescript
// ✅ GOOD: Rhythm and spacing
<section className="py-24 sm:py-32">           {/* Section padding */}
  <div className="mx-auto max-w-7xl px-6">     {/* Container */}
    <div className="space-y-16">               {/* Large gaps */}
      <div className="space-y-4">              {/* Related content */}
        <h2 className="text-3xl">Title</h2>
        <p className="text-lg">Description</p>
      </div>
      
      <div className="grid gap-6 md:grid-cols-3"> {/* Card grid */}
        <Card className="p-6">Content</Card>
      </div>
    </div>
  </div>
</section>
```

### Spacing Scale

- `gap-2` (0.5rem / 8px): Tight elements
- `gap-4` (1rem / 16px): Related items
- `gap-6` (1.5rem / 24px): Cards, list items
- `gap-8` (2rem / 32px): Section components
- `gap-16` (4rem / 64px): Major sections

---

## Component Styling

### Buttons

```typescript
// ✅ GOOD: Modern button styling
<div className="flex gap-4">
  {/* Primary: Always rounded-full */}
  <Button className="rounded-full px-8">
    Primary Action
  </Button>
  
  {/* Secondary */}
  <Button variant="outline" className="rounded-full px-8">
    Secondary Action
  </Button>
  
  {/* Icon button */}
  <Button size="icon" className="rounded-full">
    <IconX className="h-4 w-4" />
  </Button>
</div>
```

### Cards

```typescript
// ✅ GOOD: Card with hover effects
<Card className="group relative overflow-hidden rounded-xl border border-gray-200 p-6 transition-all hover:border-gray-300 hover:shadow-lg dark:border-gray-800 dark:hover:border-gray-700">
  <div className="space-y-4">
    {/* Content */}
  </div>
  
  {/* Gradient accent on hover */}
  <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient opacity-0 transition-opacity group-hover:opacity-100" />
</Card>
```

### Inputs

```typescript
// ✅ GOOD: Consistent input styling
<div className="space-y-2">
  <Label htmlFor="name">Project Name</Label>
  <Input
    id="name"
    placeholder="Enter project name"
    className="rounded-lg"
  />
  {error && (
    <p className="text-sm text-red-600">{error.message}</p>
  )}
</div>
```

---

## Responsive Design

### Mobile-First Approach

```typescript
// ✅ GOOD: Mobile-first, progressive enhancement
<div className="
  flex flex-col          // Mobile: Stack vertically
  gap-4                  // Mobile: 16px gap
  md:flex-row           // Tablet: Side by side
  md:gap-6              // Tablet: 24px gap
  lg:gap-8              // Desktop: 32px gap
  xl:max-w-7xl          // Large: Max width
">
  <div className="w-full md:w-1/2">Column 1</div>
  <div className="w-full md:w-1/2">Column 2</div>
</div>
```

### Breakpoints

Test at these specific widths:
- **320px**: Small mobile
- **768px**: Tablet
- **1024px**: Desktop
- **1440px**: Large desktop

### Responsive Typography

```typescript
// ✅ GOOD: Fluid typography
<h1 className="
  text-3xl              // Mobile: 30px
  sm:text-4xl           // Small: 36px
  md:text-5xl           // Medium: 48px
  lg:text-6xl           // Large: 60px
  font-bold
  tracking-tight
">
  Responsive Headline
</h1>
```

---

## Dark Mode

### Implementation

```typescript
// ✅ GOOD: Comprehensive dark mode support
<div className="
  bg-white dark:bg-gray-950
  border border-gray-200 dark:border-gray-800
">
  <h2 className="text-gray-900 dark:text-white">
    Title
  </h2>
  <p className="text-gray-600 dark:text-gray-400">
    Description
  </p>
  
  {/* Images with dark mode variants */}
  <img 
    src="/logo-light.svg" 
    alt="Logo"
    className="block dark:hidden" 
  />
  <img 
    src="/logo-dark.svg" 
    alt="Logo"
    className="hidden dark:block" 
  />
</div>
```

### Color Contrast

Ensure sufficient contrast ratios:
- **Normal text**: 4.5:1 minimum
- **Large text**: 3:1 minimum
- **Interactive elements**: 3:1 minimum

---

## Accessibility (WCAG AA Minimum)

### Semantic HTML

```typescript
// ✅ GOOD: Semantic, accessible markup
<nav aria-label="Main navigation">
  <ul>
    <li>
      <a href="/projects">Projects</a>
    </li>
  </ul>
</nav>

<main>
  <article>
    <header>
      <h1>Article Title</h1>
    </header>
    <section>
      <h2>Section Heading</h2>
      <p>Content</p>
    </section>
  </article>
</main>
```

### ARIA Labels

```typescript
// ✅ GOOD: Descriptive ARIA labels
<button 
  aria-label="Close modal"
  onClick={handleClose}
>
  <IconX className="h-4 w-4" />
</button>

<div 
  role="alert" 
  aria-live="polite"
>
  {errorMessage}
</div>

<input
  type="search"
  aria-label="Search projects"
  aria-describedby="search-help"
/>
<p id="search-help" className="sr-only">
  Search by project name or description
</p>
```

### Keyboard Navigation

```typescript
// ✅ GOOD: Keyboard accessible
<Dialog>
  <DialogTrigger asChild>
    <Button>Open</Button>
  </DialogTrigger>
  
  <DialogContent> {/* Traps focus automatically */}
    <DialogTitle>Modal Title</DialogTitle>
    <DialogDescription>
      This modal can be closed with Escape
    </DialogDescription>
    
    {/* First focusable element */}
    <Input autoFocus />
    
    <DialogFooter>
      <Button onClick={handleCancel}>Cancel</Button>
      <Button onClick={handleConfirm}>Confirm</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Focus States

```typescript
// ✅ GOOD: Visible focus indicators
<button className="
  rounded-lg
  focus:outline-none
  focus:ring-2
  focus:ring-blue-500
  focus:ring-offset-2
">
  Interactive Element
</button>
```

---

## Micro-interactions

### Hover Effects

```typescript
// ✅ GOOD: Subtle, meaningful hover effects
<Card className="
  transition-all
  duration-200
  hover:shadow-lg
  hover:scale-[1.02]
">
  <Link href={`/projects/${id}`}>
    <h3 className="
      text-gray-900
      transition-colors
      group-hover:text-gradient
    ">
      Project Title
    </h3>
  </Link>
</Card>
```

### Loading States

```typescript
// ✅ GOOD: Smooth loading transitions
<Button disabled={isLoading}>
  {isLoading ? (
    <>
      <IconLoader className="mr-2 h-4 w-4 animate-spin" />
      Loading...
    </>
  ) : (
    'Submit'
  )}
</Button>

// Skeleton loader
<div className="space-y-4">
  <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
  <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
</div>
```

### Transitions

```typescript
// ✅ GOOD: Purposeful transitions
<div className="
  opacity-0
  transition-all
  duration-300
  ease-in-out
  data-[state=open]:opacity-100
  data-[state=open]:translate-y-0
  data-[state=closed]:translate-y-4
">
  Content
</div>
```

---

## Icons

### Usage

```typescript
// ✅ GOOD: @tabler/icons-react exclusively
import { IconHome, IconUser, IconSettings } from '@tabler/icons-react';

<div className="flex items-center gap-2">
  <IconHome className="h-5 w-5 text-gray-500" />
  <span>Home</span>
</div>

// Sized variants
<IconUser className="h-4 w-4" />  // Small
<IconUser className="h-5 w-5" />  // Default
<IconUser className="h-6 w-6" />  // Large
```

### Rules

- **Always** use `@tabler/icons-react`
- Never use Lucide, Heroicons, or other icon libraries
- Maintain consistent sizing (h-4, h-5, h-6)
- Avoid icon-heavy designs

---

## Layout Patterns

### Container Widths

```typescript
// ✅ GOOD: Consistent container pattern
<div className="mx-auto max-w-7xl px-6 lg:px-8">
  {/* Content constrained to readable width */}
</div>

// Narrow container for text
<div className="mx-auto max-w-3xl px-6">
  <article>
    <p className="text-lg leading-relaxed">
      Long-form content
    </p>
  </article>
</div>
```

### Grid Layouts

```typescript
// ✅ GOOD: Responsive grid
<div className="
  grid
  gap-6
  grid-cols-1
  sm:grid-cols-2
  lg:grid-cols-3
  xl:grid-cols-4
">
  {items.map((item) => (
    <Card key={item.id}>{item.name}</Card>
  ))}
</div>
```

---

## Anti-Patterns to Avoid

❌ **Generic Templates**: Don't use standard bootstrap layouts
❌ **Icon Overload**: Avoid putting icons everywhere
❌ **Inconsistent Spacing**: Always use the spacing scale
❌ **Hardcoded Gradients**: Use utility classes
❌ **Poor Contrast**: Test color combinations
❌ **Broken Dark Mode**: Always test in both modes
❌ **Missing Focus States**: All interactive elements need focus indicators
❌ **Non-semantic HTML**: Use proper HTML5 elements

---

## Design Checklist

Before considering a component complete:

- [ ] Responsive at all breakpoints (320px, 768px, 1024px, 1440px)
- [ ] Dark mode tested and working
- [ ] Keyboard navigation functional
- [ ] Focus states visible
- [ ] Color contrast meets WCAG AA
- [ ] ARIA labels where needed
- [ ] Loading states implemented
- [ ] Error states handled
- [ ] Hover effects smooth
- [ ] Typography follows scale
- [ ] Spacing follows scale
- [ ] Uses brand gradients correctly
- [ ] Icons from @tabler/icons-react

---

## References

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Tailwind CSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Tabler Icons](https://tabler.io/icons)

---

**Last Updated**: 2026-02-03  
**Version**: 1.0.0
