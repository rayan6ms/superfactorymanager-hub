import type { User } from "@prisma/client";

export type InteractionAction =
  | "create-post"
  | "create-comment"
  | "vote-post"
  | "vote-comment"
  | "create-build"
  | "update-build"
  | "fork-build";

export type InteractionUser = Pick<
  User,
  "canCreatePosts" | "canCreateComments" | "canVotePosts" | "canVoteComments" | "interactionBanUntil"
>;

const actionMap: Record<InteractionAction, { flag: keyof InteractionUser; label: string }> = {
  "create-post": { flag: "canCreatePosts", label: "create new posts" },
  "create-comment": { flag: "canCreateComments", label: "add comments" },
  "vote-post": { flag: "canVotePosts", label: "vote on posts" },
  "vote-comment": { flag: "canVoteComments", label: "vote on comments" },
  "create-build": { flag: "canCreatePosts", label: "create builds" },
  "update-build": { flag: "canCreatePosts", label: "update builds" },
  "fork-build": { flag: "canCreatePosts", label: "fork builds" },
};

export function interactionBlockReason(user: InteractionUser | null, action: InteractionAction): string | null {
  if (!user) return null;
  const now = new Date();
  if (user.interactionBanUntil && user.interactionBanUntil > now) {
    return `User interactions are paused until ${user.interactionBanUntil.toLocaleString()}.`;
  }

  const config = actionMap[action];
  if (!config) return null;

  if (!user[config.flag]) {
    return `You do not have permission to ${config.label}.`;
  }

  return null;
}
