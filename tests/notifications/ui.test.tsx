import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notification, preview } from "./fixtures";
import type { SerializedNotification } from "../../src/lib/notifications-shared";

mock.module("next/link", () => ({
  default: (props: Record<string, unknown>) => createElement("a", props),
}));
mock.module("next/image", () => ({ default: () => null }));

const { default: HeaderNotifications } =
  await import("../../src/components/layout/HeaderNotifications");
const { default: NotificationBadge } =
  await import("../../src/components/layout/NotificationBadge");
const { default: NotificationCenter } =
  await import("../../src/components/notifications/NotificationCenter");
const { default: useNotificationPreview } =
  await import("../../src/components/notifications/useNotificationPreview");
const { updateNotifications } = await import("../../src/lib/notification-client");

const dom = new Window({ url: "http://localhost/" });
let root: Root;
let container: HTMLDivElement;
let records: SerializedNotification[];
let requests: Array<{ url: URL; body?: { ids?: string[]; all?: boolean; read?: boolean } }>;
let failNext = false;
let delayNext: ((response: Response) => void) | undefined;
let holdNext = false;
const nativeFetch = globalThis.fetch;

beforeAll(() => {
  Object.assign(globalThis, {
    window: dom,
    document: dom.document,
    navigator: dom.navigator,
    HTMLElement: dom.HTMLElement,
    CustomEvent: dom.CustomEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
});

beforeEach(() => {
  records = [notification("new"), notification("older"), notification("read", true)];
  requests = [];
  failNext = false;
  holdNext = false;
  delayNext = undefined;
  globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ url, body });
    if (holdNext) {
      holdNext = false;
      return new Promise<Response>((resolve) => {
        delayNext = resolve;
      });
    }
    if (failNext) {
      failNext = false;
      return new Response(null, { status: 500 });
    }
    if (body) {
      records = records.map((item) =>
        body.all || body.ids?.includes(item.id)
          ? { ...item, readAt: body.read ? new Date().toISOString() : null }
          : item,
      );
      return Response.json(preview(records));
    }
    if (url.searchParams.get("unreadOnly") === "1") return Response.json(preview(records));
    const start = url.searchParams.has("cursor")
      ? records.findIndex((item) => item.id === url.searchParams.get("cursor")) + 1
      : 0;
    const items = records.slice(start, start + 10);
    return Response.json({
      notifications: items,
      unreadCount: url.searchParams.has("includeUnreadCount") ? 0 : preview(records).unreadCount,
      nextCursor: start + 10 < records.length ? items.at(-1)?.id : null,
    });
  }) as unknown as typeof fetch;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  globalThis.fetch = nativeFetch;
});

function HeaderHarness({ userId = "viewer" }: { userId?: string }) {
  const { notifications, unreadCount, loading, error, refresh } = useNotificationPreview(userId);
  return (
    <section data-testid="header">
      <NotificationBadge count={unreadCount} />
      <button onClick={() => void refresh()}>Open menu</button>
      <HeaderNotifications
        notifications={notifications}
        unreadCount={unreadCount}
        loading={loading}
        loadError={error}
        onRetry={refresh}
        onMarkRead={async (id) => {
          await updateNotifications({ ids: [id], read: true });
        }}
      />
    </section>
  );
}

async function render(node: ReactNode) {
  await act(async () => root.render(node));
}
function section(name: "header" | "center") {
  return container.querySelector<HTMLElement>(`[data-testid="${name}"]`)!;
}
function button(scope: ParentNode, label: string) {
  const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(
    (el) => el.textContent?.trim() === label,
  );
  expect(found).toBeDefined();
  return found!;
}
async function click(scope: ParentNode, label: string) {
  await act(async () => button(scope, label).click());
}
async function both() {
  await render(
    <>
      <HeaderHarness />
      <section data-testid="center">
        <NotificationCenter
          initialNotifications={records.slice(0, 10)}
          initialUnreadCount={preview(records).unreadCount}
          initialCursor={records.length > 10 ? records[9].id : null}
        />
      </section>
    </>,
  );
}

describe("notification menu and center", () => {
  test("fills the initially empty dropdown and badge when the delayed request completes", async () => {
    holdNext = true;
    await render(<HeaderHarness />);
    expect(section("header").textContent).toContain("Loading notifications");
    await act(async () => delayNext!(Response.json(preview(records))));
    expect(section("header").textContent).toContain("Notification new");
    expect(section("header").textContent).not.toContain("No unread notifications");
    expect(section("header").querySelector('[aria-label="2 unread notifications"]')).not.toBeNull();
  });

  test("controlled preview accepts new items without remounting", async () => {
    const onMarkRead = async () => {};
    await render(
      <HeaderNotifications notifications={[]} unreadCount={0} onMarkRead={onMarkRead} />,
    );
    await render(
      <HeaderNotifications notifications={records} unreadCount={2} onMarkRead={onMarkRead} />,
    );
    expect(container.textContent).toContain("Notification new");
    expect(container.textContent).toContain("2 unread");
  });

  test("marking in the menu updates the center, replenishes the preview, and supports marking unread again", async () => {
    await both();
    await click(section("header"), "Mark read");
    expect(section("header").textContent).toContain("Notification older");
    expect(section("center").querySelector("li")?.textContent).toContain("Mark unread");
    expect(section("header").querySelector('[aria-label="1 unread notifications"]')).not.toBeNull();
    expect(
      button(section("center"), "Mark unread").querySelector("svg.lucide-mail"),
    ).not.toBeNull();
    expect(
      button(section("center"), "Mark read").querySelector("svg.lucide-check-check"),
    ).not.toBeNull();
    await click(section("center"), "Mark unread");
    expect(section("header").textContent).toContain("Notification new");
    expect(section("header").querySelector('[aria-label="2 unread notifications"]')).not.toBeNull();
  });

  test("refresh keeps older unread items even when the center's first page is entirely read", async () => {
    records = [
      ...Array.from({ length: 10 }, (_, i) => notification(`read${i}`, true)),
      notification("old-unread"),
    ];
    await both();
    await click(section("center"), "Refresh");
    expect(section("header").textContent).toContain("Notification old-unread");
    expect(section("center").textContent).toContain("1 unread");
    await click(section("center"), "Mark all read");
    expect(requests.at(-1)?.body).toEqual({ all: true, read: true });
    expect(records.every((item) => !!item.readAt)).toBe(true);
    expect(section("header").textContent).toContain("No unread notifications");
  });

  test("reading the last loaded unread item replenishes from beyond the loaded page", async () => {
    records = [
      notification("new"),
      ...Array.from({ length: 9 }, (_, i) => notification(`read${i}`, true)),
      notification("old-unread"),
    ];
    await both();
    await click(section("center"), "Mark read");
    expect(section("header").textContent).toContain("Notification old-unread");
    expect(section("center").textContent).toContain("1 unread");
  });

  test("failed mutations preserve the item and count and expose a retryable error", async () => {
    await both();
    failNext = true;
    await click(section("header"), "Mark read");
    expect(section("header").querySelector('[role="alert"]')).not.toBeNull();
    expect(section("header").textContent).toContain("Notification new");
    expect(section("header").querySelector('[aria-label="2 unread notifications"]')).not.toBeNull();
    expect(button(section("header"), "Mark read").disabled).toBe(false);
    await click(section("header"), "Mark read");
    expect(section("header").querySelector('[role="alert"]')).toBeNull();
    expect(section("header").textContent).toContain("Notification older");
  });

  test("does not claim the inbox is empty on a failed load; retry loads it", async () => {
    failNext = true;
    await render(<HeaderHarness />);
    expect(container.textContent).not.toContain("All caught up");
    expect(container.textContent).not.toContain("No unread notifications");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await click(container, "Retry");
    expect(container.textContent).toContain("Notification new");
  });

  test("a stale preview response cannot undo a completed read action", async () => {
    await both();
    holdNext = true;
    await click(section("header"), "Open menu");
    const stale = preview(records);
    await click(section("center"), "Mark read");
    await act(async () => delayNext!(Response.json(stale)));
    expect(section("header").textContent).not.toContain("Notification new");
    expect(section("header").querySelector('[aria-label="1 unread notifications"]')).not.toBeNull();
  });

  test("load more does not overwrite the unread count with a pagination hint", async () => {
    records = Array.from({ length: 15 }, (_, i) => notification(String(i)));
    await both();
    await click(section("center"), "Load more");
    expect(section("center").textContent).toContain("15 notifications loaded");
    expect(section("center").textContent).toContain("15 unread");
    expect(
      section("header").querySelector('[aria-label="15 unread notifications"]'),
    ).not.toBeNull();
  });

  test("opening the menu and returning to the tab fetch new notifications", async () => {
    await render(<HeaderHarness />);
    records.unshift(notification("arrived"));
    await click(section("header"), "Open menu");
    expect(section("header").textContent).toContain("Notification arrived");
    records.unshift(notification("on-focus"));
    await act(async () => window.dispatchEvent(new dom.Event("focus") as unknown as Event));
    expect(section("header").textContent).toContain("Notification on-focus");
  });
});
