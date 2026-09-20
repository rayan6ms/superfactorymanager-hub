import { describe, expect, test } from "bun:test";
import { mergeTaggedPosts, resolveTagNavigation, tagPageHref } from "../../src/lib/tag-navigation";

const known = Array.from({ length: 65 }, (_, i) => `tag-${i}`);
describe("bounded tag navigation", () => {
  test("existing single-tag bookmarks and directory pages remain valid", () => {
    expect(resolveTagNavigation({ tags: "tag-1" }, known)).toMatchObject({
      slugs: ["tag-1"],
      page: 1,
      needsRedirect: false,
    });
    expect(resolveTagNavigation({ page: "3" }, known)).toMatchObject({
      page: 3,
      needsRedirect: false,
    });
  });
  test.each([
    [{ page: "999999999" }, "/tags?page=3"],
    [{ page: "1" }, "/tags"],
    [{ page: "0" }, "/tags"],
    [{ page: "NaN" }, "/tags"],
    [{ page: "1.5" }, "/tags"],
    [{ page: "02" }, "/tags?page=2"],
    [{ tags: "unknown" }, "/tags"],
    [{ tags: "" }, "/tags"],
    [{ tags: ["tag-1", "tag-2"] }, "/tags?tags=tag-1"],
    [{ tags: " TAG-2,tag-1,tag-2,missing " }, "/tags?tags=tag-1%2Ctag-2"],
    [{ tags: "tag-0,tag-1,tag-2,tag-3" }, "/tags?tags=tag-0%2Ctag-1%2Ctag-2"],
    [{ tags: "tag-1", arbitrary: "cache-buster" }, "/tags?tags=tag-1"],
  ])("normalizes %j in one redirect", (params, href) => {
    const result = resolveTagNavigation(params, known);
    expect(result.needsRedirect).toBe(true);
    expect(result.href).toBe(href);
    const canonical = Object.fromEntries(new URL(href, "https://example.com").searchParams);
    expect(resolveTagNavigation(canonical, known).needsRedirect).toBe(false);
  });
  test("RSC cache parameter does not cause navigation loops", () => {
    expect(resolveTagNavigation({ tags: "tag-1", _rsc: "opaque" }, known).needsRedirect).toBe(
      false,
    );
  });
  test("no catalogue gives a finite directory with no post queries", () => {
    expect(resolveTagNavigation({ tags: "anything", page: "99" }, [])).toMatchObject({
      slugs: [],
      page: 1,
      href: "/tags",
    });
  });
  test("shareable filter URLs are sorted, deduplicated and escaped", () => {
    expect(tagPageHref(["tag-2", "tag-1", "tag-2"], 2)).toBe("/tags?tags=tag-1%2Ctag-2&page=2");
  });
  test("merging per-tag caches preserves OR semantics, ordering and the 30-post limit", () => {
    const posts = Array.from({ length: 80 }, (_, i) => ({
      id: String(i).padStart(3, "0"),
      uploadDate: new Date(2026, 0, 1, 0, i),
    }));
    const groupA = posts.filter((_, i) => i % 2 === 0);
    const groupB = posts.filter((_, i) => i % 3 === 0);
    const expected = posts
      .filter((_, i) => i % 2 === 0 || i % 3 === 0)
      .reverse()
      .slice(0, 30);
    expect(
      mergeTaggedPosts([groupA.reverse().slice(0, 30), groupB.reverse().slice(0, 30)]),
    ).toEqual(expected);
  });
});
