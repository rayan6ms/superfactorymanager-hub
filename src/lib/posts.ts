import type { Prisma, PrismaClient } from "@prisma/client";

export type PrismaClientOrTransaction = PrismaClient | Prisma.TransactionClient;

export async function resetPostRatings(client: PrismaClientOrTransaction, postId: string) {
  await client.rating.deleteMany({ where: { postId } });
  await client.post.update({ where: { id: postId }, data: { rating: 0, ratingCount: 0 } });
}

export async function recordPostContributor(
  client: PrismaClientOrTransaction,
  postId: string,
  userId: string,
) {
  await client.postContributor.upsert({
    where: { postId_userId: { postId, userId } },
    update: {
      mergedCommits: { increment: 1 },
      lastContributionAt: new Date(),
    },
    create: { postId, userId, mergedCommits: 1 },
  });
}
