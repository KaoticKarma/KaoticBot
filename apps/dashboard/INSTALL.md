# FIXED Dashboard Files - Installation Instructions

## What Was Fixed
✅ Changed all imports from `'./api'` to `'./apiClient'` to avoid conflict with `/api` proxy
✅ Restored proper App.tsx with routing
✅ All config files have correct names (vite.config.ts, tailwind.config.js, postcss.config.js)

## Installation Steps

1. **Download ALL these files**
2. **Delete your entire `apps/dashboard` folder contents** (or just replace files one by one)
3. **Put all these files in `apps/dashboard`**
4. **Make sure you have BOTH:**
   - `apiClient.ts` (NEW - the API functions)
   - Delete any old `api.ts` file if it still exists
5. **Open terminal in `apps/dashboard` and run:**
   ```bash
   npm install
   npm run dev
   ```
6. **Open browser at http://localhost:5173**

## Critical Files to Verify
- ✅ apiClient.ts (not api.ts!)
- ✅ App.tsx (should have Routes, not test code)
- ✅ All .tsx files import from './apiClient'
- ✅ vite.config.ts (not vite_config.ts)
- ✅ tailwind.config.js (not tailwind_config.js)
- ✅ postcss.config.js (not postcss_config.js)

## If It Still Doesn't Work
1. Stop Vite (Ctrl+C)
2. Delete `node_modules` folder
3. Delete `.vite` folder (if exists)
4. Run `npm install` again
5. Run `npm run dev`
6. Hard refresh browser (Ctrl+Shift+R)

The dashboard should now load completely!