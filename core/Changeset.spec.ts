import { assertEquals } from "std/testing/asserts.ts";
import { WorkingChangeset, Changeset } from "./Changeset.ts";
import { NoopLogger, ConsoleLogger } from "./Logger.ts";
import { fracIdxBetween } from "./fracIdx.ts";

export function changeset(cset: Partial<Changeset>): Changeset {
  return {
    schema: 0,
    ...cset,
  };
}

const zeroRng = {
  random: () => 0,
};

const onlyExplicitMode = false;

async function doTest(
  t: any,
  config: {
    base: Partial<Changeset>;
    change: Partial<Changeset> | Partial<Changeset>[];
    expected: Partial<Changeset>;
    authoritativeOnly?: boolean;
    nonAuthoritativeOnly?: boolean;
    only?: boolean;
  }
) {
  if (onlyExplicitMode && !config.only) {
    return;
  }

  const makeSubject = () =>
    new WorkingChangeset(
      config.base,
      onlyExplicitMode ? new ConsoleLogger() : new NoopLogger(),
      zeroRng
    );

  const base = changeset(config.base);
  const changes = Array.isArray(config.change)
    ? config.change.map(changeset)
    : [changeset(config.change)];
  const expected = changeset(config.expected);

  if (config.authoritativeOnly) {
    const subject = makeSubject();
    for (const change of changes) {
      subject.changeAuthoritative(change);
    }
    const got = subject.collect();
    assertEquals(got, expected);
  } else if (config.nonAuthoritativeOnly) {
    const subject = makeSubject();
    for (const change of changes) {
      subject.change(change);
    }
    const got = subject.collect();
    assertEquals(got, expected);
  } else {
    await t.step("non-authoritative", () => {
      const subject = makeSubject();
      for (const change of changes) {
        subject.change(change);
      }
      const got = subject.collect();
      assertEquals(got, expected);
    });
    await t.step("authoritative", () => {
      const subject = makeSubject();
      for (const change of changes) {
        subject.changeAuthoritative(change);
      }
      const got = subject.collect();
      assertEquals(got, expected);
    });
  }
}

Deno.test("rejects direct cycle", (t) =>
  doTest(t, {
    authoritativeOnly: true,
    base: {
      create: ["N1", "N2"],
      position: [
        ["N1", "root", "A"],
        ["N2", "root", "B"],
      ],
    },
    change: [
      {
        position: [["N1", "N2", "A"]],
        property: [["N1", "foo", "bar"]],
      },
      {
        position: [["N2", "N1", "A"]], // must be rejected
        property: [["N2", "foo", "bar"]], // must be accepted
      },
    ],
    expected: {
      create: ["N1", "N2"],
      position: [
        ["N1", "N2", "A"],
        ["N2", "root", "B"],
      ],
      property: [
        ["N1", "foo", "bar"],
        ["N2", "foo", "bar"],
      ],
    },
  })
);

Deno.test("rejects indirect cycle", async (t) =>
  doTest(t, {
    authoritativeOnly: true,
    base: {
      create: ["N1", "N2", "N3"],
      position: [
        ["N1", "root", "A"],
        ["N2", "N1", "A"],
        ["N3", "N2", "A"],
      ],
    },
    /*
  Prior:
    | node | parent |
    |------|--------|
    | root |        |
    | a    | root   |
    | b    | a      |
    | c    | b      |

    root
      a
        b
          c

  Update:
    | node | parent |
    |------|--------|
    | root |        |
    | a    | c   |
    | b    | a      |
    | c    | b      |

    root
    ---
    c
      a
        b
    c
  */

    change: {
      create: ["N4"],
      position: [
        // rejected
        ["N1", "N3", "A"],
        // accepted
        ["N4", "root", "Z"],
      ],
    },

    expected: {
      create: ["N1", "N2", "N3", "N4"],
      position: [
        ["N1", "root", "A"],
        ["N2", "N1", "A"],
        ["N3", "N2", "A"],
        ["N4", "root", "Z"],
      ],
    },
  })
);

Deno.test("fixes colliding idx with no after", async (t) =>
  doTest(t, {
    authoritativeOnly: true,
    base: {
      create: ["N1", "N2"],
      position: [
        ["N1", "root", "A"],
        ["N2", "root", "B"],
      ],
    },
    change: {
      position: [["N2", "root", "A"]],
    },
    expected: {
      create: ["N1", "N2"],
      position: [
        ["N1", "root", "A"],
        ["N2", "root", fracIdxBetween(zeroRng, "A", "")],
      ],
    },
  })
);

Deno.test("fixes colliding idx with after", async (t) =>
  doTest(t, {
    authoritativeOnly: true,
    base: {
      create: ["N1", "N2", "N3"],
      position: [
        ["N1", "root", "A"],
        ["N2", "root", "B"],
        ["N3", "root", "O"],
      ],
    },
    change: {
      position: [["N2", "root", "A"]],
    },
    expected: {
      create: ["N1", "N2", "N3"],
      position: [
        ["N1", "root", "A"],
        ["N2", "root", fracIdxBetween(zeroRng, "A", "O")],
        ["N3", "root", "O"],
      ],
    },
  })
);

Deno.test("position changes applied in order", async (t) => {
  const base: Changeset = {
    schema: 0,
    create: ["N1", "N2", "N3"],
    position: [
      ["N1", "root", "A"],
      ["N2", "root", "B"],
      ["N3", "root", "Q"],
    ],
  };

  await t.step("if the changes conflict", (t) =>
    doTest(t, {
      authoritativeOnly: true,
      base,
      change: {
        position: [
          ["N2", "root", "A"], // conflicts with N1
          ["N1", "root", "B"],
        ],
      },
      expected: {
        create: ["N1", "N2", "N3"],
        position: [
          ["N1", "root", "B"],
          ["N2", "root", "I"], // the conflict was resolved
          ["N3", "root", "Q"],
        ],
      },
    })
  );

  await t.step("if the changes do not conflict", (t) =>
    doTest(t, {
      authoritativeOnly: true,
      base,
      change: {
        position: [
          ["N1", "root", "Z"],
          ["N2", "root", "A"],
          ["N1", "root", "B"],
        ],
      },

      expected: {
        create: ["N1", "N2", "N3"],
        position: [
          ["N1", "root", "B"],
          ["N2", "root", "A"],
          ["N3", "root", "Q"],
        ],
      },
    })
  );
});

Deno.test("deletes recursively", async (t) =>
  doTest(t, {
    base: {
      create: ["N1", "N2", "N3"],
      position: [
        ["N1", "root", "A"],
        ["N2", "N1", "A"],
        ["N3", "N2", "A"],
      ],
    },
    change: {
      delete: ["N1"],
    },
    expected: {
      delete: ["N1", "N2", "N3"],
    },
  })
);

Deno.test("rejects authoritative move to non-existent parent", async (t) =>
  doTest(t, {
    authoritativeOnly: true,
    base: {
      create: ["N1"],
      position: [["N1", "root", "A"]],
    },
    change: {
      position: [["N1", "non-existent", "A"]],
    },
    expected: {
      create: ["N1"],
      position: [["N1", "root", "A"]],
    },
  })
);

Deno.test(
  "does not reject non-authoritative move to non-existent parent",
  async (t) =>
    doTest(t, {
      nonAuthoritativeOnly: true,
      base: {
        create: ["N1"],
        position: [["N1", "root", "A"]],
      },
      change: {
        position: [["N1", "non-existent", "A"]],
      },
      expected: {
        create: ["N1"],
        position: [["N1", "non-existent", "A"]],
      },
    })
);

Deno.test("rejects create without position", async (t) =>
  doTest(t, {
    base: {},
    change: {
      create: ["N1"],
    },
    expected: {},
  })
);

Deno.test("rejects authoritative create with non-existent parent", async (t) =>
  doTest(t, {
    authoritativeOnly: true,
    base: {},
    change: {
      create: ["N1"],
      position: [["N1", "non-existent", "A"]],
    },
    expected: {},
  })
);

Deno.test(
  "does not reject non-authoritative create with non-existent parent",
  async (t) =>
    doTest(t, {
      nonAuthoritativeOnly: true,
      base: {},
      change: {
        create: ["N1"],
        position: [["N1", "non-existent", "A"]],
      },
      expected: {
        create: ["N1"],
        position: [["N1", "non-existent", "A"]],
      },
    })
);
