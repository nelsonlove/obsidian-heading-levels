import { describe, expect, test } from "vitest";
import { parseHeadings, shiftHeadings } from "./headings";

describe("parseHeadings", () => {
  test("detects ATX headings with their levels and 0-indexed lines", () => {
    const text = "# A\ntext\n### C";
    expect(parseHeadings(text)).toEqual([
      { line: 0, level: 1 },
      { line: 2, level: 3 },
    ]);
  });

  test("requires whitespace (or end of line) after the hashes", () => {
    // '#tag' and '###nospace' are not headings; '#' alone and '## ' are.
    const text = "#tag\n###nospace\n#\n## ";
    expect(parseHeadings(text)).toEqual([
      { line: 2, level: 1 },
      { line: 3, level: 2 },
    ]);
  });

  test("allows up to 3 leading spaces, ignores 4+", () => {
    const text = "   ## indented\n    #### code-indent";
    expect(parseHeadings(text)).toEqual([{ line: 0, level: 2 }]);
  });

  test("ignores hashes inside fenced code blocks", () => {
    const text = "# A\n```\n# not a heading\n```\n## B";
    expect(parseHeadings(text)).toEqual([
      { line: 0, level: 1 },
      { line: 4, level: 2 },
    ]);
  });

  test("handles tilde fences and info strings", () => {
    const text = "~~~js\n# nope\n~~~\n# real";
    expect(parseHeadings(text)).toEqual([{ line: 3, level: 1 }]);
  });
});

describe("shiftHeadings — cursor, single heading (opt-arrow)", () => {
  test("demote adds one hash to the heading on the cursor line", () => {
    const r = shiftHeadings({
      text: "# A\ntext\n## B",
      direction: "demote",
      scope: { kind: "cursor", line: 0, subtree: false },
    });
    expect(r.text).toBe("## A\ntext\n## B");
    expect(r.changed).toBe(true);
  });

  test("promote removes one hash", () => {
    const r = shiftHeadings({
      text: "## A",
      direction: "promote",
      scope: { kind: "cursor", line: 0, subtree: false },
    });
    expect(r.text).toBe("# A");
  });

  test("does not touch children", () => {
    const r = shiftHeadings({
      text: "## A\n### B\ntext",
      direction: "demote",
      scope: { kind: "cursor", line: 0, subtree: false },
    });
    expect(r.text).toBe("### A\n### B\ntext");
  });

  test("resolves the cursor to the nearest preceding heading", () => {
    const r = shiftHeadings({
      text: "# A\ntext\n## B",
      direction: "demote",
      scope: { kind: "cursor", line: 1, subtree: false },
    });
    expect(r.text).toBe("## A\ntext\n## B");
  });

  test("refuses to promote past H1 with a message, unchanged", () => {
    const r = shiftHeadings({
      text: "# A",
      direction: "promote",
      scope: { kind: "cursor", line: 0, subtree: false },
    });
    expect(r.changed).toBe(false);
    expect(r.text).toBe("# A");
    expect(r.message).toBeTruthy();
  });

  test("refuses to demote past H6 with a message", () => {
    const r = shiftHeadings({
      text: "###### A",
      direction: "demote",
      scope: { kind: "cursor", line: 0, subtree: false },
    });
    expect(r.changed).toBe(false);
    expect(r.message).toBeTruthy();
  });

  test("no heading at or before the cursor is a no-op with a message", () => {
    const r = shiftHeadings({
      text: "text\n# A",
      direction: "demote",
      scope: { kind: "cursor", line: 0, subtree: false },
    });
    expect(r.changed).toBe(false);
    expect(r.message).toBeTruthy();
  });

  test("preserves trailing content and empty headings", () => {
    expect(
      shiftHeadings({
        text: "## Hello world  ",
        direction: "demote",
        scope: { kind: "cursor", line: 0, subtree: false },
      }).text,
    ).toBe("### Hello world  ");
    expect(
      shiftHeadings({
        text: "##",
        direction: "demote",
        scope: { kind: "cursor", line: 0, subtree: false },
      }).text,
    ).toBe("###");
  });
});

describe("shiftHeadings — cursor, subtree (opt-shift-arrow)", () => {
  test("demote shifts the heading and all descendants uniformly", () => {
    const r = shiftHeadings({
      text: "## A\n### B\ntext\n## C",
      direction: "demote",
      scope: { kind: "cursor", line: 0, subtree: true },
    });
    // A and its child B move; sibling C (same level) is the boundary.
    expect(r.text).toBe("### A\n#### B\ntext\n## C");
  });

  test("subtree stops at the next equal-or-shallower heading", () => {
    const r = shiftHeadings({
      text: "## A\n### B\n# C\n### D",
      direction: "demote",
      scope: { kind: "cursor", line: 0, subtree: true },
    });
    // C is shallower (H1) so it and everything after are untouched.
    expect(r.text).toBe("### A\n#### B\n# C\n### D");
  });

  test("refuses when the root is already H1 (promote)", () => {
    const r = shiftHeadings({
      text: "# A\n## B",
      direction: "promote",
      scope: { kind: "cursor", line: 0, subtree: true },
    });
    expect(r.changed).toBe(false);
    expect(r.text).toBe("# A\n## B");
    expect(r.message).toBeTruthy();
  });

  test("refuses when any descendant would pass H6 (demote)", () => {
    const r = shiftHeadings({
      text: "##### A\n###### B",
      direction: "demote",
      scope: { kind: "cursor", line: 0, subtree: true },
    });
    expect(r.changed).toBe(false);
    expect(r.message).toBeTruthy();
  });
});

describe("shiftHeadings — selection (clamps independently)", () => {
  test("demotes every heading whose line is within the selection", () => {
    const r = shiftHeadings({
      text: "# A\n## B\n### C",
      direction: "demote",
      scope: { kind: "selection", fromLine: 0, toLine: 2 },
    });
    expect(r.text).toBe("## A\n### B\n#### C");
  });

  test("only includes headings inside the selected line range", () => {
    const r = shiftHeadings({
      text: "# A\ntext\n## B\n### C",
      direction: "demote",
      scope: { kind: "selection", fromLine: 2, toLine: 3 },
    });
    expect(r.text).toBe("# A\ntext\n### B\n#### C");
  });

  test("clamps at H6 on demote, still applies to the rest", () => {
    const r = shiftHeadings({
      text: "# A\n###### B",
      direction: "demote",
      scope: { kind: "selection", fromLine: 0, toLine: 1 },
    });
    expect(r.text).toBe("## A\n###### B");
    expect(r.changed).toBe(true);
  });

  test("clamps at H1 on promote, still applies to the rest", () => {
    const r = shiftHeadings({
      text: "# A\n## B",
      direction: "promote",
      scope: { kind: "selection", fromLine: 0, toLine: 1 },
    });
    expect(r.text).toBe("# A\n# B");
    expect(r.changed).toBe(true);
  });

  test("no headings in selection is a no-op", () => {
    const r = shiftHeadings({
      text: "# A\nplain\ntext",
      direction: "demote",
      scope: { kind: "selection", fromLine: 1, toLine: 2 },
    });
    expect(r.changed).toBe(false);
  });
});

describe("shiftHeadings — all headings in note", () => {
  test("demotes every heading uniformly", () => {
    const r = shiftHeadings({
      text: "# A\n## B\ntext\n### C",
      direction: "demote",
      scope: { kind: "all" },
    });
    expect(r.text).toBe("## A\n### B\ntext\n#### C");
  });

  test("refuses (uniform) if any heading would pass H6", () => {
    const r = shiftHeadings({
      text: "# A\n###### B",
      direction: "demote",
      scope: { kind: "all" },
    });
    expect(r.changed).toBe(false);
    expect(r.message).toBeTruthy();
  });

  test("refuses if any heading is already H1 on promote", () => {
    const r = shiftHeadings({
      text: "# A\n## B",
      direction: "promote",
      scope: { kind: "all" },
    });
    expect(r.changed).toBe(false);
  });

  test("ignores headings inside code fences", () => {
    const r = shiftHeadings({
      text: "# A\n```\n# fake\n```\n## B",
      direction: "demote",
      scope: { kind: "all" },
    });
    expect(r.text).toBe("## A\n```\n# fake\n```\n### B");
  });
});

describe("shiftHeadings — formatting preservation", () => {
  test("preserves CRLF line endings", () => {
    const r = shiftHeadings({
      text: "# A\r\ntext\r\n## B",
      direction: "demote",
      scope: { kind: "all" },
    });
    expect(r.text).toBe("## A\r\ntext\r\n### B");
  });

  test("preserves a trailing newline", () => {
    const r = shiftHeadings({
      text: "# A\n",
      direction: "demote",
      scope: { kind: "cursor", line: 0, subtree: false },
    });
    expect(r.text).toBe("## A\n");
  });

  test("preserves leading indentation on the heading", () => {
    const r = shiftHeadings({
      text: "   ## A",
      direction: "demote",
      scope: { kind: "cursor", line: 0, subtree: false },
    });
    expect(r.text).toBe("   ### A");
  });
});
