import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Notification } from "@prisma/client";
import { notification } from "./fixtures";

type Query = {
  where: { userId: string; readAt?: null; id?: { in: string[] } };
  take?: number;
  cursor?: { id: string };
  skip?: number;
  data?: { readAt: Date | null };
};

let records: Notification[];
let userId: string | undefined = "viewer";
const matches = (item: Notification, query: Query) =>
  item.userId === query.where.userId &&
  (query.where.readAt !== null || !item.readAt) &&
  (!query.where.id || query.where.id.in.includes(item.id));
const findMany = mock(async (query: Query) => {
  const selected = records.filter((item) => matches(item, query));
  const start = query.cursor
    ? selected.findIndex((item) => item.id === query.cursor!.id) + (query.skip ?? 0)
    : 0;
  return selected.slice(start, start + (query.take ?? selected.length));
});
const count = mock(async (query: Query) => records.filter((item) => matches(item, query)).length);
const updateMany = mock(async (query: Query) => {
  let updated = 0;
  records = records.map((item) => {
    if (!matches(item, query)) return item;
    updated++;
    return { ...item, readAt: query.data!.readAt };
  });
  return { count: updated };
});

mock.module("../../src/lib/db", () => ({ db: { notification: { findMany, count, updateMany } } }));
mock.module("../../src/lib/auth", () => ({
  auth: async () => (userId ? { user: { id: userId } } : null),
}));
const { GET, PATCH } = await import("../../src/app/api/notifications/route");

beforeEach(() => {
  userId = "viewer";
  records = Array.from({ length: 23 }, (_, i) => {
    const item = notification(`id-${String(i).padStart(2, "0")}`);
    return {
      ...item,
      userId: "viewer",
      createdAt: new Date(Date.UTC(2026, 8, 16, 12, 0, 23 - i)),
      readAt: null,
      metadata: null,
      emailedAt: null,
    };
  });
  records.push({ ...records[0], id: "other-user", userId: "someone-else" });
  findMany.mockClear();
  count.mockClear();
  updateMany.mockClear();
});

function patch(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("notification API", () => {
  test("pagination returns every notification exactly once, including page boundaries", async () => {
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const params = new URLSearchParams({ limit: "10", ...(cursor ? { cursor } : {}) });
      const response = await GET(new Request(`http://localhost/api/notifications?${params}`));
      const page = await response.json();
      expect(page.unreadCount).toBe(23);
      ids.push(...page.notifications.map((item: { id: string }) => item.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(ids).toEqual(records.filter((item) => item.userId === "viewer").map((item) => item.id));
    expect(new Set(ids).size).toBe(23);
    expect(findMany.mock.calls[0][0]).toMatchObject({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  });

  test("read and unread updates return a fresh preview and never alter another user's item", async () => {
    const first = await (await patch({ ids: ["id-00", "other-user"], read: true })).json();
    expect(first.unreadCount).toBe(22);
    expect(first.notifications.map((item: { id: string }) => item.id)).toEqual([
      "id-01",
      "id-02",
      "id-03",
      "id-04",
      "id-05",
    ]);
    expect(records.at(-1)?.readAt).toBeNull();
    const second = await (await patch({ ids: ["id-00"], read: false })).json();
    expect(second.unreadCount).toBe(23);
    expect(second.notifications[0].id).toBe("id-00");
    expect(second.notifications[0].readAt).toBeNull();
  });

  test("mark all read includes unloaded pages and is scoped to the authenticated user", async () => {
    const data = await (await patch({ all: true, read: true })).json();
    expect(data).toEqual({ unreadCount: 0, notifications: [] });
    expect(records.filter((item) => item.userId === "viewer").every((item) => !!item.readAt)).toBe(
      true,
    );
    expect(records.at(-1)?.readAt).toBeNull();
    expect(updateMany.mock.calls[0][0].where).toEqual({ userId: "viewer", readAt: null });
  });

  test("unread-only preview excludes read items before limiting results", async () => {
    records.slice(0, 12).forEach((item) => {
      item.readAt = new Date();
    });
    const data = await (
      await GET(new Request("http://localhost/api/notifications?unreadOnly=1&limit=5"))
    ).json();
    expect(data.unreadCount).toBe(11);
    expect(data.notifications.map((item: { id: string }) => item.id)).toEqual([
      "id-12",
      "id-13",
      "id-14",
      "id-15",
      "id-16",
    ]);
  });

  test("signed-out requests cannot read or modify notifications", async () => {
    userId = undefined;
    expect((await GET(new Request("http://localhost/api/notifications"))).status).toBe(401);
    expect((await patch({ all: true, read: true })).status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  test.each([
    null,
    [],
    {},
    { ids: [] },
    { ids: [42] },
    { all: true, read: false },
    { ids: ["id-00"], read: "false" },
  ])("rejects invalid changes without updating records: %j", async (body) => {
    expect((await patch(body)).status).toBe(400);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
