// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Paragraph } from '../structure/index.ts'
import { imagePathsOf, isDirectSrc, srcOf, useFigureImages } from './figures.ts'

afterEach(cleanup)

/**
 * jsdom has no object URLs at all — it isn't a browser and holds no blobs — so
 * they are installed rather than spied on. Returns the two logs the tests care
 * about: every URL minted, and every one given back.
 */
function stubObjectUrls() {
  const created: string[] = []
  const revoked: string[] = []
  let next = 0

  Object.assign(URL, {
    createObjectURL: () => {
      next += 1
      created.push(`blob:${next}`)
      return `blob:${next}`
    },
    revokeObjectURL: (url: string) => {
      revoked.push(url)
    },
  })

  return { created, revoked }
}

function figure(anchor: string, src?: string): Paragraph {
  return {
    anchor: `[${anchor}]` as never,
    text: 'A caption.',
    kind: 'figure',
    ...(src === undefined ? {} : { image: { src } }),
  }
}

describe('which pictures a section needs', () => {
  it('asks for each stored path once', () => {
    const paragraphs = [
      figure('ch01-s01-p001', 'OEBPS/fig1.png'),
      figure('ch01-s01-p002', 'OEBPS/fig1.png'),
      figure('ch01-s01-p003', 'OEBPS/fig2.png'),
    ]
    expect(imagePathsOf(paragraphs)).toEqual(['OEBPS/fig1.png', 'OEBPS/fig2.png'])
  })

  it('leaves out pictures that are already addresses, and blocks with none', () => {
    const paragraphs = [
      figure('ch01-s01-p001', 'data:image/png;base64,AAAA'),
      figure('ch01-s01-p002', 'https://example.com/plate.jpg'),
      figure('ch01-s01-p003'),
    ]
    expect(imagePathsOf(paragraphs)).toEqual([])
  })

  it('knows an address from an archive path', () => {
    expect(isDirectSrc('data:image/png;base64,AAAA')).toBe(true)
    expect(isDirectSrc('https://example.com/a.png')).toBe(true)
    expect(isDirectSrc('OEBPS/images/fig1.png')).toBe(false)
  })
})

describe('choosing what to render', () => {
  it('prefers an address as written and looks up everything else', () => {
    const images = new Map([['OEBPS/fig1.png', 'blob:one']])
    expect(srcOf('data:image/png;base64,AAAA', images)).toBe('data:image/png;base64,AAAA')
    expect(srcOf('OEBPS/fig1.png', images)).toBe('blob:one')
    // Undefined, not the path: an unresolvable path in an `<img>` is a broken
    // image icon, and a caption alone is better.
    expect(srcOf('OEBPS/gone.png', images)).toBeUndefined()
  })
})

describe('resolving a section’s pictures', () => {
  function Harness({
    paragraphs,
    load,
  }: {
    paragraphs: Paragraph[]
    load: (paths: readonly string[]) => Promise<Map<string, Blob>>
  }) {
    const images = useFigureImages(paragraphs, load)
    return <div data-testid="urls">{[...images.values()].join(',')}</div>
  }

  const blob = new Blob(['x'], { type: 'image/png' })

  it('mints a URL per stored picture and revokes them all when the page goes', async () => {
    const { created, revoked } = stubObjectUrls()

    const load = vi.fn(async () => new Map([['OEBPS/fig1.png', blob]]))
    const view = render(
      <Harness paragraphs={[figure('ch01-s01-p001', 'OEBPS/fig1.png')]} load={load} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('urls').textContent).toBe('blob:1')
    })

    // The whole reason the hook owns the URLs: `createObjectURL` pins the bytes
    // in memory until revoked, so a reader turning through a picture book would
    // otherwise end up holding the entire book.
    view.unmount()
    expect(created).toEqual(['blob:1'])
    expect(revoked).toEqual(created)
  })

  it('asks once and does not re-fetch while the same section is on screen', async () => {
    stubObjectUrls()

    const load = vi.fn(async () => new Map([['OEBPS/fig1.png', blob]]))
    const view = render(
      <Harness paragraphs={[figure('ch01-s01-p001', 'OEBPS/fig1.png')]} load={load} />,
    )
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1))

    // A fresh array of the same paragraphs, which is what every render of the
    // reading page produces. Keyed on the paths, so nothing is fetched again.
    view.rerender(<Harness paragraphs={[figure('ch01-s01-p001', 'OEBPS/fig1.png')]} load={load} />)
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1))
  })

  it('keeps a picture that is still wanted when the list around it changes', async () => {
    const { revoked } = stubObjectUrls()

    const load = vi.fn(async (paths: readonly string[]) =>
      new Map(paths.map((path) => [path, blob] as const)),
    )
    const view = render(
      <Harness paragraphs={[figure('ch01-s01-p001', 'OEBPS/fig1.png')]} load={load} />,
    )
    await waitFor(() => expect(screen.getByTestId('urls').textContent).toBe('blob:1'))

    // The reading page turns: the same picture is still on screen, and a
    // neighbour's picture joins the list. The first one must not be disturbed.
    // It used to be revoked and fetched again, and in the gap between those two
    // the figure on screen fell back to its caption.
    view.rerender(
      <Harness
        paragraphs={[figure('ch01-s01-p001', 'OEBPS/fig1.png'), figure('ch01-s02-p001', 'OEBPS/fig2.png')]}
        load={load}
      />,
    )

    await waitFor(() => expect(screen.getByTestId('urls').textContent).toBe('blob:1,blob:2'))
    expect(revoked).toEqual([])
    // Only the one it did not already hold.
    expect(load).toHaveBeenLastCalledWith(['OEBPS/fig2.png'])
  })

  it('lets go of a picture once it is out of reach', async () => {
    const { revoked } = stubObjectUrls()

    const load = vi.fn(async (paths: readonly string[]) =>
      new Map(paths.map((path) => [path, blob] as const)),
    )
    const view = render(
      <Harness
        paragraphs={[figure('ch01-s01-p001', 'OEBPS/fig1.png'), figure('ch01-s02-p001', 'OEBPS/fig2.png')]}
        load={load}
      />,
    )
    await waitFor(() => expect(screen.getByTestId('urls').textContent).toBe('blob:1,blob:2'))

    // The reader has moved far enough that the first picture is neither the page
    // nor a neighbour. Held URLs pin their bytes, so this is the promise that
    // stops a picture book accumulating in memory.
    view.rerender(
      <Harness paragraphs={[figure('ch01-s02-p001', 'OEBPS/fig2.png')]} load={load} />,
    )

    await waitFor(() => expect(revoked).toEqual(['blob:1']))
    expect(screen.getByTestId('urls').textContent).toBe('blob:2')
  })

  it('shows nothing rather than failing when the pictures cannot be read', async () => {
    const load = vi.fn(async () => {
      throw new Error('storage is gone')
    })
    render(<Harness paragraphs={[figure('ch01-s01-p001', 'OEBPS/fig1.png')]} load={load} />)

    await waitFor(() => expect(load).toHaveBeenCalled())
    expect(screen.getByTestId('urls').textContent).toBe('')
  })

  it('asks for nothing when the section has no stored pictures', () => {
    const load = vi.fn(async () => new Map<string, Blob>())
    render(<Harness paragraphs={[figure('ch01-s01-p001')]} load={load} />)
    expect(load).not.toHaveBeenCalled()
  })
})
