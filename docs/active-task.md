# Active task

**What's in here:** the one task in flight and the exact files to open for it.
Read this first every session. Add a path to "Files in scope" before you open
it.

## Task

Judge **Check folder for new books** on the phone (WP-43).

The code is built and tested. Nobody has pressed the button on a device. The
folder picker needs a real folder and a real finger, so a test cannot do this.

## Steps

1. Put some books in a folder on the phone.
2. Open the Library. Tap **+**.
3. Tap **Import a folder of books**. Pick that folder. Wait for the import.
4. Tap **+** again. **Check folder for new books** must now be in the menu.
5. Tap it. It must say every book is already on the shelf.
6. Put one new book in the folder. Tap **Check folder for new books** again.
7. The report must name the new book.

## What to watch for

- The menu item is missing after step 3.
- On iOS the item must open the folder picker. On Android Chrome it must not.
- A book that is imported a second time.
- A picker that opens where the reader did not expect it to.
- An error after the app has been closed and opened again. The browser drops
  permission on its own, so the app should ask again, not fail.

## Files in scope

- `web/src/import/folder.ts` — the folder the app remembers.
- `web/src/storage/handles.ts` — the one row that holds it.
- `web/src/library/AddButton.tsx` — the "+" menu.
- `web/src/pages/Library.tsx` — `recheckFolder` and `ImportReport`.
