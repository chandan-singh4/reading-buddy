/**
 * The catalogue, over the wire.
 *
 * The other half of `api/books/google.ts`. That endpoint holds the key and
 * nothing else; this holds the shape of the conversation and none of the
 * judgment. All the deciding is in `lookup.ts` and `match.ts`, where it can be
 * tested against real books.
 *
 * ## Every failure throws
 *
 * On purpose, and it is the most important line in the file. `lookupBook`
 * catches and reports `failed`, which stores nothing. Returning an empty list
 * for a 429 instead would quietly become "Google has no record of this book",
 * written to the database as a fact, and never revisited.
 */
import { CloudError, accessToken } from '../storage/cloud/client.ts'
import type { Catalogue } from './lookup.ts'
import type { VolumeInfo } from './volume.ts'

/** Overridable for `vercel dev` on another port — see the note in `blobs.ts`. */
const BOOKS_URL =
  (import.meta.env.VITE_BOOKS_URL as string | undefined)?.trim() || '/api/books/google'

async function post(body: unknown): Promise<Response> {
  const token = await accessToken()
  const response = await fetch(BOOKS_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    if (response.status === 401) throw new CloudError('Your session has expired. Sign in again.')
    throw new CloudError(`The book catalogue could not be reached (${response.status}).`)
  }
  return response
}

/** A search result, stripped to the only field worth taking from a stub: its id. */
interface SearchResponse {
  items?: { id?: string }[]
}

interface VolumesResponse {
  volumes?: { volumeInfo?: VolumeInfo }[]
}

export function createCatalogue(): Catalogue {
  return {
    async search(query) {
      const response = await post({ op: 'search', q: query })
      const body = (await response.json()) as SearchResponse
      return (body.items ?? [])
        .map((item) => item.id)
        .filter((id): id is string => typeof id === 'string')
        .map((id) => ({ id }))
    },

    async volumes(ids) {
      const response = await post({ op: 'volumes', ids: [...ids] })
      const body = (await response.json()) as VolumesResponse
      // `volumeInfo` is where every field this app stores actually lives; a
      // volume without one is a shell, and an empty object simply fails the
      // guard rather than pretending to be a book.
      return (body.volumes ?? []).map((volume) => volume.volumeInfo ?? {})
    },
  }
}

/**
 * The cover's bytes, through the proxy.
 *
 * Bytes rather than a URL because a stored link is a picture that vanishes when
 * someone else's server changes its mind, and is missing whenever the phone is
 * offline — which is most of the point of this app. Through the proxy because
 * Google's image hosts send no CORS headers, so the page cannot read the bytes
 * itself.
 *
 * A missing cover is not a failure: `undefined` means the book keeps whatever
 * cover it already had.
 */
export async function fetchCover(url: string): Promise<Blob | undefined> {
  try {
    const response = await post({ op: 'cover', url })
    const blob = await response.blob()
    return blob.size > 0 ? blob : undefined
  } catch {
    return undefined
  }
}
