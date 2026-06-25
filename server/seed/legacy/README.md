# Legacy SEO seed (Phase 28)

`allPosts.ts` and `contentBuilder.ts` are **deprecated** and must not drive public `/tin-tuc`.

## Use instead

1. `npm run seed:cms-categories` — default categories + author
2. Admin → **Nội dung SEO** — paste Markdown or AI draft
3. `npm run migrate:legacy-posts` — import old 30 posts as `draft` (not published)
4. `npm run migrate:legacy-posts -- --archive` — import as `archived`

Public blog reads **only** from PostgreSQL `blog_posts` where `status = published`.
