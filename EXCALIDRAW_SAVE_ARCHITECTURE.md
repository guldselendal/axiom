# Excalidraw Save Architecture

## Overview
Robust, Obsidian-style saving system for Excalidraw files with atomic writes, change tracking, and crash-safe persistence.

## Core Principles

### 1. Single Source of Truth
- The `.excalidraw` file on disk is the authoritative state
- No IndexedDB, no cache as truth
- In-memory state is ephemeral and derived from disk

### 2. Full-Document Saves
- Always save complete Excalidraw JSON (elements, appState, files)
- No deltas, no partial updates
- Format: Standard Excalidraw JSON structure

### 3. Atomic Writes
- Pattern: `file.excalidraw.tmp` → `fsync` → `rename` to `file.excalidraw`
- Never write directly to target file
- Prevents corruption on crash/power loss

### 4. Change Tracking
- Compute hash of serialized scene JSON
- Save only if hash differs from last saved hash
- Prevents unnecessary writes and save loops

### 5. Debounced Saving
- 500ms debounce delay (configurable 300-800ms)
- Batch rapid changes
- Flush on critical events (close, blur, beforeunload)

## Save Triggers

1. **Excalidraw onChange** (debounced)
2. **Editor blur / tab switch**
3. **File close / switch**
4. **App shutdown** (beforeunload)
5. **Preview request when dirty**

## File Format

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

## Implementation Components

### A. Atomic Write (Electron Main Process)
```typescript
// Pattern: temp file → fsync → rename
const tempPath = filePath + '.tmp'
await writeFile(tempPath, content, 'utf-8')
await fsync(tempPath) // Ensure data is on disk
await rename(tempPath, filePath)
```

### B. Change Tracking (Renderer)
```typescript
// Hash-based change detection
const contentHash = hash(JSON.stringify(excalidrawData))
if (contentHash !== lastSavedHash) {
  // Trigger save
}
```

### C. Debounced Save
```typescript
// Debounce with immediate flush on critical events
const debouncedSave = debounce(saveToFile, 500)
const immediateSave = () => {
  debouncedSave.cancel()
  saveToFile()
}
```

## Error Handling

- If save fails: preserve existing file, surface error
- Never silently discard changes
- Retry on transient failures
- Log all save operations

## External File Changes

- Watch for file changes on disk
- If editor is clean → auto-reload
- If editor is dirty → prompt user (reload vs keep)

## Preview Consistency

- Preview always derived from same JSON that was/will be saved
- Invalidate preview when JSON changes
- Never show stale previews

## Invariants

1. File on disk is always valid JSON
2. Never lose user changes on crash
3. Preview matches saved state
4. No save loops (hash-based deduplication)
5. Atomic writes prevent partial/corrupt files



