import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * Every screen must read the repository the reader chose.
 *
 * `storage/index.ts` picks the device library or the cloud one at load.
 * `storage/repository.ts` is always the device, whatever the reader picked. The
 * two look identical at the call site and behave identically in every test,
 * because the tests run on the device backend.
 *
 * That is what made this bug so quiet. The whole summary feature imported the
 * device repository directly. On a device library it worked perfectly. On a
 * cloud library it asked an empty local database about a book that was not
 * there, found no chapters and no title, and reported "this book has no
 * chapters saved on this device" — about a book sitting open on the shelf.
 *
 * No unit test could catch it, because a unit test has no backend choice to
 * ignore. So this reads the imports instead.
 */

const HERE = import.meta.dirname;
const SRC = join(HERE, "..");

/** The one export that ignores the reader's choice, and where it lives. */
const DEVICE_ONLY = "from '../storage/repository.ts'";

function filesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .filter((entry) => !entry.name.includes(".test."))
    .map((entry) => join(dir, entry.name));
}

describe("the summary feature", () => {
  it("reads the library the reader chose, not always the device", () => {
    const offenders = [
      ...filesIn(HERE),
      ...filesIn(join(SRC, "pages")),
      ...filesIn(join(SRC, "tutor")),
    ]
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          `import { repository } ${DEVICE_ONLY}`,
        ),
      )
      .map((path) => path.slice(SRC.length + 1));

    expect(offenders).toEqual([]);
  });
});
