// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { Anchor, BlockKind, Paragraph } from '../structure/index.ts'
import { Block, elementIdOf } from './blocks.tsx'
// The same stylesheet the component uses, so these assertions hold whether or
// not the test run hashes CSS-module class names.
import styles from './blocks.module.css'

function blockOf(kind: BlockKind, text: string, extra: Partial<Paragraph> = {}): Paragraph {
  return { anchor: '[ch02-s03-p013]' as Anchor, kind, text, ...extra }
}

// Explicit because Testing Library only auto-cleans when Vitest runs with
// `globals: true`, and this project doesn't. Without it `screen` sees every
// previous test's output too, and counting elements quietly over-reports.
afterEach(cleanup)

describe('anchors reach the page', () => {
  it('strips the brackets to make a usable element id', () => {
    expect(elementIdOf('[ch02-s03-p013]')).toBe('ch02-s03-p013')
  })

  it.each<BlockKind>([
    'prose',
    'heading',
    'quote',
    'list',
    'code',
    'figure',
    'table',
    'formula',
    'note',
  ])('puts the anchor on a %s block', (kind) => {
    const { container } = render(<Block block={blockOf(kind, 'Some text.')} />)
    // WP-15 scrolls back to a position by this id and WP-17 reports a
    // selection by it. A block without one is invisible to both.
    expect(container.querySelector('#ch02-s03-p013')).not.toBeNull()
  })
})

describe('each kind renders as what it is', () => {
  it('renders prose as a paragraph', () => {
    const { container } = render(<Block block={blockOf('prose', 'Ordinary prose.')} />)
    expect(container.querySelector('p')?.textContent).toBe('Ordinary prose.')
  })

  it('renders a heading as a heading', () => {
    render(<Block block={blockOf('heading', 'On Symbols')} />)
    expect(screen.getByRole('heading', { name: 'On Symbols' })).toBeTruthy()
  })

  it('renders a quote as a blockquote', () => {
    const { container } = render(<Block block={blockOf('quote', 'Quoted.')} />)
    expect(container.querySelector('blockquote')).not.toBeNull()
  })

  it('keeps code in a pre so its line breaks survive', () => {
    const { container } = render(<Block block={blockOf('code', 'a\n  b')} />)
    expect(container.querySelector('pre code')?.textContent).toBe('a\n  b')
  })

  it('splits a list block into its items', () => {
    // The parser keeps a list as one block with one item per line (WP-38), so
    // the split belongs here rather than in a second pass over the text.
    render(<Block block={blockOf('list', 'First\nSecond\nThird')} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('ignores blank lines when splitting a list', () => {
    render(<Block block={blockOf('list', 'First\n\nSecond\n')} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })
})

describe('tables keep their grid', () => {
  it('renders rows and cells, with the first row as the header', () => {
    render(
      <Block
        block={blockOf('table', 'Year 1990 2000', {
          rows: [
            ['Year', 'Value'],
            ['1990', '3'],
            ['2000', '7'],
          ],
        })}
      />,
    )

    expect(screen.getByRole('columnheader', { name: 'Year' })).toBeTruthy()
    expect(screen.getAllByRole('row')).toHaveLength(3)
    expect(screen.getByRole('cell', { name: '2000' })).toBeTruthy()
  })

  it('falls back to the flattened text when the grid did not survive parsing', () => {
    // Every block carries readable `text` precisely so this case degrades to
    // something correct instead of to an empty box.
    const { container } = render(<Block block={blockOf('table', 'Year 1990 2000')} />)
    expect(container.querySelector('table')).toBeNull()
    expect(container.textContent).toContain('Year 1990 2000')
  })
})

/**
 * The seam between the source book's own page divisions and this screen. The
 * parser records *that* a division was there (`startsPage`); the class is how it
 * becomes a page, and the class has to sit on the outermost element of every
 * kind — the one the column box can actually break before.
 */
describe('a block that opens a new page', () => {
  it.each<BlockKind>([
    'prose',
    'heading',
    'quote',
    'list',
    'code',
    'figure',
    'table',
    'formula',
    'note',
  ])('carries the break class on the outer element of a %s block', (kind) => {
    const { container } = render(
      <Block block={blockOf(kind, 'Some text.', { startsPage: true })} />,
    )
    const outer = container.firstElementChild
    expect(outer?.classList.contains(styles.startsPage)).toBe(true)
  })

  it('leaves the class off an ordinary block, which must not break', () => {
    const { container } = render(<Block block={blockOf('prose', 'Some text.')} />)
    expect(container.firstElementChild?.classList.contains(styles.startsPage)).toBe(false)
  })

  it('keeps the kind’s own styling alongside it', () => {
    // The break is added to the class list, never in place of it — a quote that
    // opens a page is still a quote.
    const { container } = render(
      <Block block={blockOf('quote', 'Some text.', { startsPage: true })} />,
    )
    const outer = container.firstElementChild
    expect(outer?.classList.contains(styles.quote)).toBe(true)
    expect(outer?.classList.contains(styles.startsPage)).toBe(true)
  })
})

describe('figures', () => {
  // What the reading page hands in: the archive path a figure was stored under,
  // resolved to something the browser can actually show (WP-39).
  const shown = new Map([['OEBPS/images/fig1.png', 'blob:fig1']])

  it('shows the image and its caption', () => {
    render(
      <Block
        block={blockOf('figure', '[Figure: Figure 1. A mandala.]', {
          image: { src: 'OEBPS/images/fig1.png', alt: 'A mandala' },
          label: 'Figure 1. A mandala.',
        })}
        images={shown}
      />,
    )

    expect(screen.getByRole('img', { name: 'A mandala' }).getAttribute('src')).toBe('blob:fig1')
    expect(screen.getByText('Figure 1. A mandala.')).toBeTruthy()
  })

  it('shows the image without a redundant placeholder caption when there is no figcaption', () => {
    // Reader-reported bug: a picture that renders fine still had "[Figure]"
    // printed underneath it, because the caption fell back to the parser's
    // placeholder text instead of the real (absent) figcaption.
    render(
      <Block
        block={blockOf('figure', '[Figure]', {
          image: { src: 'OEBPS/images/fig1.png', alt: 'A mandala' },
        })}
        images={shown}
      />,
    )

    expect(screen.getByRole('img', { name: 'A mandala' })).toBeTruthy()
    expect(screen.queryByText('[Figure]')).toBeNull()
  })

  it('falls back to the caption as alt text when the parser recorded none', () => {
    render(
      <Block
        block={blockOf('figure', 'Figure 2. A diagram.', {
          image: { src: 'OEBPS/images/fig1.png' },
        })}
        images={shown}
      />,
    )
    expect(screen.getByRole('img', { name: 'Figure 2. A diagram.' })).toBeTruthy()
  })

  it('shows an image that is already an address without looking it up', () => {
    // docx figures arrive as `data:` URIs and markdown ones as URLs — usable as
    // written, and nothing in storage to find.
    render(
      <Block
        block={blockOf('figure', 'Figure 4. Inline.', {
          image: { src: 'data:image/png;base64,AAAA', alt: 'Inline' },
        })}
      />,
    )
    expect(screen.getByRole('img', { name: 'Inline' }).getAttribute('src')).toBe(
      'data:image/png;base64,AAAA',
    )
  })

  it('degrades to the caption alone when the picture was never stored', () => {
    // Every book imported before WP-39 is this case: the figure knows its
    // archive path, and there are no bytes behind it. A caption is readable;
    // a broken-image icon is not.
    const { container } = render(
      <Block block={blockOf('figure', 'Figure 5. A plate.', { image: { src: 'fig5.png' } })} />,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('Figure 5. A plate.')).toBeTruthy()
  })

  it('degrades to the caption alone when there is no image', () => {
    const { container } = render(<Block block={blockOf('figure', 'Figure 3. A chart.')} />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('Figure 3. A chart.')).toBeTruthy()
  })
})

describe('an unfamiliar kind still shows its text', () => {
  it('renders as a paragraph rather than as nothing', () => {
    // The guarantee that lets new block kinds be added to the parser without
    // the reader silently dropping them.
    const { container } = render(
      <Block block={blockOf('sidebar' as BlockKind, 'Something new.')} />,
    )
    expect(container.textContent).toBe('Something new.')
  })
})

describe('links in the text', () => {
  const target = '[ch05-s01-p001]' as Anchor

  it('makes a contents entry tappable', () => {
    // The bug this covers: a list was rendered as plain text, so every entry on
    // a book's own contents page was dead while a footnote in a paragraph
    // worked. Contents pages are lists.
    const followed: Anchor[] = []
    render(
      <Block
        block={blockOf('list', '• One\n• Two', {
          links: [{ start: 2, end: 5, anchor: target }],
        })}
        onFollowLink={(anchor) => followed.push(anchor)}
      />,
    )

    fireEvent.click(screen.getByRole('link', { name: 'One' }))
    expect(followed).toEqual([target])
    // The entry without a link is still there, just not tappable.
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })

  it('makes a link inside a paragraph tappable', () => {
    const followed: Anchor[] = []
    render(
      <Block
        block={blockOf('prose', 'See note 4 below.', {
          links: [{ start: 4, end: 10, anchor: target }],
        })}
        onFollowLink={(anchor) => followed.push(anchor)}
      />,
    )

    fireEvent.click(screen.getByRole('link', { name: 'note 4' }))
    expect(followed).toEqual([target])
  })

  it('sends an external link out as a real link, not a jump', () => {
    render(<Block block={blockOf('prose', 'Read more here.', {
      links: [{ start: 10, end: 14, url: 'https://example.com' }],
    })} />)

    const link = screen.getByRole('link', { name: 'here' })
    expect(link.getAttribute('href')).toBe('https://example.com')
    expect(link.getAttribute('rel')).toContain('noopener')
  })
})

/**
 * A link has to behave like a word. It did not, and the contents page of a real
 * book is where that showed: an internal link was a `<button>`, a button is a
 * box whatever its `display` says, and a box is laid out whole — so a long entry
 * could not break across a line or a column. It hung past the column edge and
 * the overhang was cut off by `overflow: hidden`, which is the missing letters
 * readers reported. Wrapped entries were centred by the button default too,
 * while the unwrapped ones stayed left.

 * It is a `<span role="link">` now, which breaks like the text around it.
 *
 * The values live in `blocks.module.css`; what is asserted here is that the
 * link keeps carrying the class that holds them, on every path that renders one.
 */
describe('a link behaves like the words around it', () => {
  const linked: Partial<Paragraph> = {
    links: [{ start: 0, end: 3, anchor: '[ch01-s01-p001]' as Anchor }],
  }

  it('styles an internal link', () => {
    const { container } = render(<Block block={blockOf('prose', 'See this.', linked)} />)
    expect(container.querySelector('[role="link"]')?.className).toContain(styles.link)
  })

  it('styles an external link', () => {
    const { container } = render(
      <Block
        block={blockOf('prose', 'See this.', {
          links: [{ start: 0, end: 3, url: 'https://example.com' }],
        })}
      />,
    )
    expect(container.querySelector('a')?.className).toContain(styles.link)
  })

  it('styles a link inside a list item — a book’s own contents page', () => {
    // The exact case that was reported. Contents entries are list items, and
    // each one is a single long link.
    const { container } = render(
      <Block
        block={blockOf('list', 'Chapter One The Worst Breathers in the Animal Kingdom', {
          links: [{ start: 0, end: 52, anchor: '[ch01-s01-p001]' as Anchor }],
        })}
      />,
    )
    expect(container.querySelector('li [role="link"]')?.className).toContain(styles.link)
  })

  it('keeps the link’s words even when it spans the whole line', () => {
    const { container } = render(
      <Block
        block={blockOf('list', 'Chapter One The Worst Breathers in the Animal Kingdom', {
          links: [{ start: 0, end: 52, anchor: '[ch01-s01-p001]' as Anchor }],
        })}
      />,
    )
    expect(container.textContent).toContain('Chapter One The Worst Breathers in the Animal Kingdom')
  })
})

describe('a heading the book only set in bold', () => {
  it('renders as a heading, not as a paragraph', () => {
    const { container } = render(
      <Block block={blockOf('prose', 'The Three Projects', { label: 'subheading' })} />,
    )
    const heading = screen.getByRole('heading', { level: 3 })
    expect(heading.textContent).toBe('The Three Projects')
    expect(heading.className).toContain(styles.heading)
    expect(container.querySelector('p')).toBeNull()
  })

  it('leaves prose without the label as a paragraph', () => {
    const { container } = render(<Block block={blockOf('prose', 'The Three Projects')} />)
    expect(container.querySelector('p')).not.toBeNull()
  })
})

describe('emphasis the source book gave', () => {
  it('draws an italic phrase inside a paragraph', () => {
    render(
      <Block
        block={blockOf('prose', 'He called it the silent partner and left.', {
          marks: [{ start: 13, end: 31, italic: true }],
        })}
      />,
    )
    const span = screen.getByText('the silent partner')
    expect(span.style.fontStyle).toBe('italic')
  })

  it('draws small caps at the size the publisher chose, in em', () => {
    // `em` and not `px`: the book decided this run is 0.8 of the line around it,
    // and the reader decides how big that line is. Neither overrules the other.
    render(
      <Block
        block={blockOf('prose', 'CHAPTER ONE begins here.', {
          marks: [{ start: 0, end: 11, size: 0.8 }],
        })}
      />,
    )
    expect(screen.getByText('CHAPTER ONE').style.fontSize).toBe('0.8em')
  })

  it('keeps the italics of a paragraph that is italic all through', () => {
    // The fast path used to test only for links, so a wholly italic paragraph
    // went down it and lost its slant.
    render(
      <Block
        block={blockOf('prose', 'She had said as much the night before.', {
          marks: [{ start: 0, end: 38, italic: true }],
        })}
      />,
    )
    expect(screen.getByText('She had said as much the night before.').style.fontStyle).toBe(
      'italic',
    )
  })

  it('draws a phrase that is both a link and italic', () => {
    render(
      <Block
        block={blockOf('prose', 'See the appendix for the figures.', {
          links: [{ start: 4, end: 16, url: 'https://example.com' }],
          marks: [{ start: 4, end: 16, italic: true }],
        })}
      />,
    )
    const link = screen.getByText('the appendix')
    expect(link.style.fontStyle).toBe('italic')
    expect(link.getAttribute('href')).toBe('https://example.com')
  })
})

describe('how the source book set a whole line', () => {
  it('centres a line the book centred, and cancels the run-on indent', () => {
    render(
      <Block block={blockOf('prose', 'for my father', { appearance: { centred: true } })} />,
    )
    const line = screen.getByText('for my father')
    expect(line.style.textAlign).toBe('center')
    expect(line.style.textIndent).toBe('0px')
  })

  it('keeps the size step between a part title and a chapter number', () => {
    render(<Block block={blockOf('heading', 'PART ONE', { appearance: { size: 1.6 } })} />)
    expect(screen.getByText('PART ONE').style.fontSize).toBe('1.6em')
  })

  it('caps a display size that would swallow a phone screen', () => {
    render(<Block block={blockOf('heading', 'THE END', { appearance: { size: 4 } })} />)
    expect(screen.getByText('THE END').style.fontSize).toBe('2em')
  })

  it('leaves ordinary prose with no inline style at all', () => {
    render(<Block block={blockOf('prose', 'Nuts fell that year in numbers.')} />)
    expect(screen.getByText('Nuts fell that year in numbers.').getAttribute('style')).toBeNull()
  })
})
