# 0005. A hand-rolled static site rather than a framework

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

The site is sixty mostly-static pages with a search box and four filter chips.
Astro or similar was the obvious alternative and was explicitly considered.

## Considered options

- **Astro** — the closest fit, and genuinely tempting for islands and content
  collections. Deferred rather than dismissed: revisit if the site outgrows
  browse, search and read.
- **Next.js or similar** — rejected as far more framework than sixty static
  pages need.
- **A documentation generator (MkDocs, Docusaurus)** — rejected: the site is an
  app over structured data, not a docs tree.
- **Hand-rolled** — chosen, on the grounds that shared modules between build and
  browser remove a class of drift bug that a framework would not.

## Decision

Generate the HTML from a script. No framework, no bundler. Browser assets are
plain ES modules the build imports directly, so the search tokeniser that builds
the index is the same function that splits a query.

## Consequences

The whole site is a few hundred kilobytes and has no dependency that can rot,
and there is no build output to keep in step with the source. Sharing modules
between the build and the browser removes a whole class of drift bug outright.
Against that: no component model, and anything genuinely interactive later will
be more work than it would have been in a framework. Revisit if the site grows
beyond browse, search and read.
