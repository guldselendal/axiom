/**
 * Robust save manager for Excalidraw files
 * Implements Obsidian-style atomic writes, change tracking, and debouncing
 */

import { ExcalidrawData } from '../types/notes'
import { hashExcalidrawData } from './contentHash'

export interface SaveOptions {
  debounceMs?: number
  onSave?: (data: ExcalidrawData, filePath: string) => Promise<{ success: boolean; error?: string }>
  onError?: (error: string) => void
}

export class ExcalidrawSaveManager {
  private filePath: string | null = null
  private lastSavedHash: string | null = null
  private debounceTimer: NodeJS.Timeout | null = null
  private isSaving: boolean = false
  private pendingData: ExcalidrawData | null = null
  private debounceMs: number
  private onSave: (data: ExcalidrawData, filePath: string) => Promise<{ success: boolean; error?: string }>
  private onError?: (error: string) => void

  constructor(options: SaveOptions) {
    this.debounceMs = options.debounceMs ?? 500
    this.onSave = options.onSave || (async () => ({ success: false, error: 'No save handler' }))
    this.onError = options.onError
  }

  /**
   * Set the file path for this save manager
   */
  setFilePath(filePath: string | null) {
    this.filePath = filePath
    this.lastSavedHash = null // Reset hash when file changes
  }

  /**
   * Mark that a file was successfully saved with this hash
   */
  markSaved(hash: string) {
    this.lastSavedHash = hash
  }

  /**
   * Get the last saved hash
   */
  getLastSavedHash(): string | null {
    return this.lastSavedHash
  }

  /**
   * Check if data is dirty (different from last saved)
   */
  isDirty(data: ExcalidrawData): boolean {
    if (!this.lastSavedHash) {
      return true // Never saved, so dirty
    }
    const currentHash = hashExcalidrawData(data)
    return currentHash !== this.lastSavedHash
  }

  /**
   * Schedule a debounced save
   * Returns true if save was scheduled, false if data is not dirty
   */
  scheduleSave(data: ExcalidrawData): boolean {
    if (!this.filePath) {
      console.warn('ExcalidrawSaveManager: Cannot save, no filePath set')
      return false
    }

    // Check if data is dirty
    if (!this.isDirty(data)) {
      return false // No changes, skip save
    }

    // Cancel any pending save
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    // Store pending data
    this.pendingData = data

    // Schedule debounced save
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      this.executeSave()
    }, this.debounceMs)

    return true
  }

  /**
   * Immediately save (cancel debounce and save now)
   * If data is provided, use it; otherwise use pending data
   */
  async flushSave(data?: { type: string; version: number; source: string; elements: any[]; appState: any; files?: any }): Promise<boolean> {
    // Cancel debounce
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    // Use provided data or pending data
    if (data) {
      this.pendingData = data as any
    }

    // Execute save if we have data
    if (this.pendingData) {
      return await this.executeSave()
    }

    return false
  }

  /**
   * Execute the actual save operation
   */
  private async executeSave(): Promise<boolean> {
    if (!this.filePath || !this.pendingData) {
      return false
    }

    // Prevent concurrent saves
    if (this.isSaving) {
      console.warn('ExcalidrawSaveManager: Save already in progress, will retry')
      return false
    }

    const dataToSave = this.pendingData
    this.pendingData = null
    this.isSaving = true

    try {
      const result = await this.onSave(dataToSave, this.filePath)

      if (result.success) {
        // Mark as saved with current hash
        const hash = hashExcalidrawData(dataToSave)
        this.markSaved(hash)
        return true
      } else {
        // Save failed - restore pending data so we can retry
        this.pendingData = dataToSave
        const errorMsg = result.error || 'Unknown save error'
        console.error('ExcalidrawSaveManager: Save failed:', errorMsg)
        if (this.onError) {
          this.onError(errorMsg)
        }
        return false
      }
    } catch (error: any) {
      // Save exception - restore pending data
      this.pendingData = dataToSave
      const errorMsg = error?.message || String(error)
      console.error('ExcalidrawSaveManager: Save exception:', errorMsg)
      if (this.onError) {
        this.onError(errorMsg)
      }
      return false
    } finally {
      this.isSaving = false
    }
  }

  /**
   * Check if there's a save in progress or pending
   */
  hasPendingSave(): boolean {
    return this.isSaving || this.pendingData !== null || this.debounceTimer !== null
  }

  /**
   * Cancel any pending saves
   */
  cancelPendingSave() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.pendingData = null
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.cancelPendingSave()
    this.filePath = null
    this.lastSavedHash = null
  }
}

