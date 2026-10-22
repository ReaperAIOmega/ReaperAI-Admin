# Recovery SDK bundle

Supabase JS 2.117.2, built from Core's locked dependencies at upstream 94faa05fea6b4602a278bc3fdad75437d6957045. Rolldown 1.2.11; browser ESM; target ES2020. No source maps or runtime CDN imports.

SHA-256: 7b989e32185b43f0720bb4549e8fc58c078f3f561bd3b69d5c1b622961b27b8d

Rebuild from the Core checkout after npm ci:

```powershell
node node_modules/rolldown/bin/cli.mjs node_modules/@supabase/supabase-js/dist/index.mjs --platform browser --format esm --minify --transform.target es2020 --file <Admin-checkout>/vendor/supabase-2.117.2.js
```

See THIRD_PARTY_NOTICES.txt. The page CSP allows only same-origin scripts and the project's HTTPS Auth endpoint.
