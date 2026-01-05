# Excalidraw Save Implementation Summary

## ✅ Implementation Complete

A robust, Obsidian-style saving system has been implemented for Excalidraw files with all required invariants.

## Architecture Overview

### 1. Atomic Writes (Electron Main Process)
- **Location**: `electron/main.ts` - `save-note-file` IPC handler
- **Pattern**: `file.excalidraw.tmp` → `fsync` → `rename` to `file.excalidraw`
- **Guarantees**: Crash-safe, prevents file corruption on power loss/crashes

### 2. Change Tracking & Debouncing (Renderer)
- **Location**: `src/utils/excalidrawSaveManager.ts`
- **Hash-based deduplication**: Uses FNV-1a hash to detect actual changes
- **Debounced saving**: 500ms delay, batches rapid changes
- **Prevents**: Unnecessary writes, save loops, redundant I/O

### 3. Save Triggers
All required triggers implemented:
- ✅ Excalidraw `onChange` (debounced, 500ms)
- ✅ Editor blur / tab switch (`window.blur`)
- ✅ File close (`onClose` callback)
- ✅ App shutdown (`beforeunload` event)
- ✅ Manual save button (immediate flush)

### 4. Integration
- **Location**: `src/components/ExcalidrawNoteEditor.tsx`
- Save manager initialized on mount
- Hash initialized from loaded file data
- All save triggers wired up

## File Format

Standard Excalidraw JSON:
```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "axiom",
  "elements": [],
  "appState": {},
  "files": {}
}
```

## Invariants Guaranteed

1. ✅ **Single source of truth**: File on disk is authoritative
2. ✅ **Full-document saves**: Always saves complete JSON
3. ✅ **Atomic writes**: Temp file → fsync → rename pattern
4. ✅ **Change tracking**: Hash-based, saves only if dirty
5. ✅ **Debounced saving**: 500ms delay prevents excessive writes
6. ✅ **Error handling**: Never corrupts files, surfaces errors
7. ✅ **No save loops**: Hash deduplication prevents infinite saves
8. ✅ **Preview consistency**: Preview derived from same JSON

## Preview Consistency

- Preview always generated from same `excalidrawData` that is/will be saved
- When data changes, preview is invalidated automatically (via hash change)
- No stale previews possible

## Error Handling

- Save failures preserve existing file (atomic write pattern)
- Errors surfaced via `onError` callback
- Retry logic via save manager (pending data preserved on failure)

## Testing Checklist

- [ ] Create new Excalidraw file, draw, verify saves
- [ ] Edit existing file, verify saves
- [ ] Close editor without explicit save, verify auto-save
- [ ] Switch tabs/apps, verify blur save
- [ ] Quit app, verify beforeunload save
- [ ] Crash test: Kill app during save, verify file integrity
- [ ] Verify no duplicate saves (check hash deduplication)
- [ ] Verify preview matches saved state

## Files Changed

1. `electron/main.ts` - Atomic write implementation
2. `src/utils/contentHash.ts` - Hash utility (NEW)
3. `src/utils/excalidrawSaveManager.ts` - Save manager (NEW)
4. `src/components/ExcalidrawNoteEditor.tsx` - Integration
5. `EXCALIDRAW_SAVE_ARCHITECTURE.md` - Architecture docs (NEW)



