# Restore Instructions

When you say "return to pineapple state", the assistant should:

1. Copy all files from `.checkpoints/pineapple-state/` back to their original locations:
   - `.checkpoints/pineapple-state/MegaSurface.tsx` → `src/components/MegaSurface.tsx`
   - `.checkpoints/pineapple-state/App.tsx` → `src/App.tsx`
   - `.checkpoints/pineapple-state/HoverEditor.tsx` → `src/components/HoverEditor.tsx`
   - `.checkpoints/pineapple-state/Sidebar.tsx` → `src/components/Sidebar.tsx`
   - `.checkpoints/pineapple-state/coords.ts` → `src/utils/coords.ts`
   - `.checkpoints/pineapple-state/storage.ts` → `src/utils/storage.ts`
   - `.checkpoints/pineapple-state/fileSystem.ts` → `src/utils/fileSystem.ts`
   - `.checkpoints/pineapple-state/index.css` → `src/index.css`

2. Verify the files were restored correctly

This checkpoint represents the state before group creation functionality was added and then removed.


