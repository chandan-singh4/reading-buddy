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

/**
 * How long a lookup may take before it is called a failure.
 *
 * There has to be a number, because `fetch` has no timeout of its own. A
 * request to a host that accepts the connection and then says nothing — a
 * captive wifi portal, a proxy, a phone that lost its signal mid-request —
 * never rejects and never resolves. The reader sees "Looking…" and it stays
 * there, which is exactly the bug this constant exists to prevent.
 *
 * Twenty seconds is long enough for a cold serverless function and two Google
 * round trips, and short enough that a stuck request still gives the reader a
 * sentence to read rather than a spinner to stare at.
 */
const TIMEOUT_MS = 20_000

/** The same deadline, applied to a promise that has no timeout of its own. */
async function within<T>(work: Promise<T>, reason: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new CloudError(reason)), TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

async function post(body: unknown): Promise<Response> {
  // Racing the token too, not only the request. `getSession` refreshes an
  // expired token over the network, so it is a second thing that can hang.
  const token = await within(accessToken(), 'signing in took too long')

  // The deadline is a race, not the abort signal. `fetch` is expected to reject
  // when a request is aborted, but the guarantee the reader needs — that the
  // button always comes back — must not rest on somebody else's promise
  // settling. The race settles on its own timer whatever `fetch` does.
  //
  // The abort is then housekeeping: once the race is lost, nothing will ever
  // read the reply, so the socket is closed rather than left receiving bytes
  // the phone is paying for.
  const stop = new AbortController()

  let response: Response
  try {
    response = await within(
      fetch(BOOKS_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal: stop.signal,
      }),
      'Google Books did not answer in time',
    )
  } catch (error) {
    if (error instanceof CloudError) {
      stop.abort()
      throw error
    }
    // `fetch` rejects with a bare "Failed to fetch" for every network-level
    // problem, which on a phone means one thing far more often than not.
    throw new CloudError('you’re offline')
  }

  if (!response.ok) throw new CloudError(reasonFor(response.status))
  return response
}

/**
 * What went wrong, in words that suggest what to do about it.
 *
 * Every one of these is shown to the reader on the book's own page, so a bare
 * status number is a wasted sentence: it tells them something failed, which they
 * already know from the fact that nothing happened. The useful part is whether
 * to press the button again, wait a day, sign in, or tell someone the server is
 * misconfigured — and those are four different answers.
 */
function reasonFor(status: number): string {
  switch (status) {
    case 401:
      return 'you’re signed out'
    case 403:
    case 429:
      // Google's free tier is about a thousand requests a day and a book costs
      // two, so a full backfill of a large shelf can genuinely reach it. It
      // resets on its own, which is the one thing worth saying.
      return 'today’s lookup limit is used up — it resets tomorrow'
    case 404:
      // Not "no such book": this is the *endpoint* missing, which means the app
      // is talking to a server that was never given the lookup function.
      return 'this copy of the app has no lookup service'
    case 503:
      return 'the lookup service has no Google Books key'
    default:
      return status >= 500 ? 'Google Books is having trouble' : `something went wrong (${status})`
  }
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
