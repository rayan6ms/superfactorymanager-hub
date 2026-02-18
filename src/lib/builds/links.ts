export const CODE_EDITOR_DRAFT_STORAGE_KEY = "codeEditorDraft:v1";
export const POST_COMPOSER_PREFILL_CODE_KEY = "postComposerPrefillCode:v1";
export const POST_REDIRECT_TOAST_STORAGE_KEY = "buildPostRedirectToast:v1";
export const POST_REDIRECT_SHARE_LINK_STORAGE_KEY = "buildPostRedirectShareLink:v1";

export function buildCurrentUserBuildPath(username: string, slug: string) {
  return `/profile/${encodeURIComponent(username)}/builds/${encodeURIComponent(slug)}`;
}

export function buildPublicBuildPath(username: string, slug: string) {
  return `/profile/${encodeURIComponent(username)}/builds/${encodeURIComponent(slug)}`;
}

export function buildBuildDraftStorageKey(username: string, slug: string) {
  return `buildDraft:${username}:${slug}:v1`;
}
