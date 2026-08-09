/**
 * The heavy half of storage: original files and pictures, in Cloudflare R2.
 *
 * ## How the bytes actually move
 *
 * Never through our own server. The browser asks `/api/r2/sign` for a
 * short-lived URL, then uploads to or downloads from Cloudflare directly. Two
 * reasons, and both are large:
 *
 * - **Cost.** R2 charges nothing for reading data back out. Proxying a 60 MB
 *   epub through a serverless function would put that same traffic on a bill
 *   that does meter it, twice over.
 * - **Speed and limits.** Serverless functions cap request bodies at a few
 *   megabytes and time out. A phone talking straight to Cloudflare has neither
 *   problem.
 *
 * ## Why every method takes a list
 *
 * The signing round trip is the expensive part — a whole HTTP request before
 * any bytes move. The reading screen asks for the handful of pictures its
 * current page mentions, so signing those six together turns seven round trips
 * into two.
 */

import { CloudError, accessToken } from './client.ts'

/** Where the signing endpoint lives. Overridable for `vercel dev` on another port. */
const SIGN_URL = (import.meta.env.VITE_R2_SIGN_URL as string | undefined) ?? '/api/r2/sign'

/** Matches `MAX_KEYS` in `api/r2/sign.ts`. */
const MAX_KEYS_PER_REQUEST = 100

export interface BlobEntry {
  key: string
  blob: Blob
}

export interface BlobStore {
  /** Store one object, replacing anything already at that key. */
  put(key: string, blob: Blob): Promise<void>
  /** Store several, signed in one round trip and uploaded a few at a time. */
  putMany(entries: readonly BlobEntry[]): Promise<void>
  /** Fetch several objects at once. Keys with nothing behind them are simply absent. */
  getMany(keys: readonly string[]): Promise<Map<string, Blob>>
  /** Fetch one, or undefined if it isn't there. */
  get(key: string): Promise<Blob | undefined>
  /** Delete several. Best-effort by contract — see `remove` below. */
  remove(keys: readonly string[]): Promise<void>
}

/**
 * How many uploads are allowed in flight at once.
 *
 * Not unbounded: the Jung epub carries 141 plates, and `Promise.all` over all
 * of them would open 141 connections from a phone, which the browser queues
 * anyway and the radio handles badly. Four keeps the pipe full without the
 * thundering herd.
 */
const UPLOAD_CONCURRENCY = 4

/** Run a job over each item, never more than `limit` at a time. */
async function pooled<T>(
  items: readonly T[],
  limit: number,
  job: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      await job(items[index] as T, index)
    }
  })
  await Promise.all(workers)
}

function chunked<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

/** Ask the endpoint for URLs, in the same order as the keys given. */
async function signAll(
  op: 'put' | 'get' | 'delete',
  keys: readonly string[],
): Promise<string[]> {
  if (keys.length === 0) return []

  const token = await accessToken()
  if (!token) {
    throw new CloudError('You’re signed out, so your files aren’t available. Sign in to continue.')
  }

  const urls: string[] = []
  for (const batch of chunked(keys, MAX_KEYS_PER_REQUEST)) {
    const response = await fetch(SIGN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ op, keys: batch }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new CloudError(
        response.status === 401
          ? 'Your session has expired. Sign in again to reach your files.'
          : `Couldn’t get permission to reach your files (${response.status}). ${detail}`,
      )
    }

    const body = (await response.json()) as { urls?: string[] }
    urls.push(...(body.urls ?? []))
  }

  return urls
}

async function upload(url: string, blob: Blob): Promise<void> {
  const response = await fetch(url, {
    method: 'PUT',
    // The only header sent, and deliberately so: the URL is signed over the
    // host alone, so anything else here is free — but a `content-type` is what
    // makes a picture come back as an image rather than a download.
    headers: blob.type ? { 'content-type': blob.type } : undefined,
    body: blob,
  })

  if (!response.ok) {
    throw new CloudError(
      `Upload failed (${response.status}). If this says CORS in the console, see docs/cloud-setup.md § 2.3.`,
    )
  }
}

export function createR2BlobStore(): BlobStore {
  return {
    async put(key, blob) {
      const [url] = await signAll('put', [key])
      if (!url) throw new CloudError('Couldn’t get permission to upload that file.')
      await upload(url, blob)
    },

    async putMany(entries) {
      if (entries.length === 0) return
      const urls = await signAll('put', entries.map((entry) => entry.key))

      await pooled(entries, UPLOAD_CONCURRENCY, async (entry, index) => {
        const url = urls[index]
        if (!url) throw new CloudError(`Couldn’t get permission to upload ${entry.key}.`)
        await upload(url, entry.blob)
      })
    },

    async getMany(keys) {
      const found = new Map<string, Blob>()
      if (keys.length === 0) return found

      const urls = await signAll('get', keys)

      // In parallel: these are independent reads of one page's worth of
      // pictures, and doing them one after another is the whole latency budget
      // of a page turn spent in series.
      await Promise.all(
        keys.map(async (key, index) => {
          const url = urls[index]
          if (!url) return
          const response = await fetch(url)
          // A missing object is a fact, not a failure — a book parsed before
          // pictures were stored has rows pointing at nothing, and the reading
          // screen already falls back to the caption.
          if (!response.ok) return
          found.set(key, await response.blob())
        }),
      )

      return found
    },

    async get(key) {
      const found = await this.getMany([key])
      return found.get(key)
    },

    /**
     * Delete objects, and never let a failure here take down the caller.
     *
     * Deliberately best-effort. Deletion runs *after* the rows are gone, so the
     * worst case is an orphaned object costing a fraction of a penny a month —
     * whereas throwing would leave the reader looking at a book they asked to
     * delete, which is still on the shelf, because a picture wouldn't go.
     */
    async remove(keys) {
      if (keys.length === 0) return
      try {
        const urls = await signAll('delete', keys)
        await Promise.all(urls.map((url) => fetch(url, { method: 'DELETE' }).catch(() => {})))
      } catch {
        // Nothing the reader can act on, and nothing they had a moment ago.
      }
    },
  }
}
