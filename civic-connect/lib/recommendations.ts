import { prisma } from "./prisma";

interface UserPreferences {
  topicWeights: Record<string, number>;
  recentBills: string[];
}

export async function getPersonalizedBills(
  userId: string,
  limit = 12
): Promise<string[]> {
  // Get user preferences
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { topicWeights: true },
  });

  if (!user) {
    return getRecentBills(limit);
  }

  const topicWeights = (user.topicWeights as Record<string, number>) || {};

  // Get recently viewed bills to avoid showing them again
  const recentViews = await prisma.billView.findMany({
    where: {
      userId,
      viewedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
    },
    select: { billId: true },
    orderBy: { viewedAt: "desc" },
    take: 50,
  });

  const viewedBillIds = recentViews.map((v) => v.billId);

  // Calculate 3:1 ratio (9 personalized, 3 random)
  const personalizedCount = Math.floor(limit * 0.75);
  const randomCount = limit - personalizedCount;

  // Get personalized bills based on topic weights
  const personalizedBills = await getTopicBasedBills(
    topicWeights,
    viewedBillIds,
    personalizedCount
  );

  // Get random/opposing bills
  const randomBills = await getRandomBills(
    viewedBillIds,
    personalizedBills.map((b) => b.id),
    randomCount
  );

  // Interleave: 3 personalized, 1 random
  const result: string[] = [];
  let pIndex = 0;
  let rIndex = 0;

  while (result.length < limit) {
    // Add 3 personalized
    for (let i = 0; i < 3 && pIndex < personalizedBills.length; i++) {
      result.push(personalizedBills[pIndex++].id);
    }
    // Add 1 random
    if (rIndex < randomBills.length) {
      result.push(randomBills[rIndex++].id);
    }
  }

  return result.slice(0, limit);
}

async function getTopicBasedBills(
  topicWeights: Record<string, number>,
  excludeIds: string[],
  limit: number
) {
  const topics = Object.keys(topicWeights).sort(
    (a, b) => topicWeights[b] - topicWeights[a]
  );

  if (topics.length === 0) {
    return prisma.bill.findMany({
      where: { id: { notIn: excludeIds } },
      orderBy: { introducedAt: "desc" },
      take: limit,
    });
  }

  // Get bills matching user's top topics
  const bills = await prisma.bill.findMany({
    where: {
      id: { notIn: excludeIds },
      topicTags: { hasSome: topics.slice(0, 5) }, // Top 5 topics
    },
    orderBy: { introducedAt: "desc" },
    take: limit * 2, // Get more to score
  });

  // Score bills based on topic match
  const scoredBills = bills.map((bill) => {
    let score = 0;
    for (const topic of bill.topicTags) {
      score += topicWeights[topic] || 0;
    }
    return { ...bill, score };
  });

  // Sort by score and recency
  scoredBills.sort((a, b) => {
    if (Math.abs(a.score - b.score) > 2) {
      return b.score - a.score;
    }
    return b.introducedAt.getTime() - a.introducedAt.getTime();
  });

  return scoredBills.slice(0, limit);
}

async function getRandomBills(
  excludeIds: string[],
  alreadySelected: string[],
  limit: number
) {
  const allExcluded = [...excludeIds, ...alreadySelected];

  // Get total count
  const totalBills = await prisma.bill.count({
    where: { id: { notIn: allExcluded } },
  });

  if (totalBills === 0) {
    return [];
  }

  // Get random bills using random skip
  const bills: Array<{ id: string; [key: string]: any }> = [];
  const attempts = Math.min(limit * 3, totalBills);

  for (let i = 0; i < attempts && bills.length < limit; i++) {
    const skip = Math.floor(Math.random() * totalBills);
    const currentExcluded = [...allExcluded, ...bills.map((b) => b.id)];
    const foundBills = await prisma.bill.findMany({
      where: { id: { notIn: currentExcluded } },
      skip,
      take: 1,
    });
    if (foundBills.length > 0) {
      bills.push(foundBills[0]);
    }
  }

  return bills;
}

async function getRecentBills(limit: number) {
  const bills = await prisma.bill.findMany({
    orderBy: { introducedAt: "desc" },
    take: limit,
    select: { id: true },
  });
  return bills.map((b) => b.id);
}

export async function getOpposingBill(
  currentBillTopics: string[],
  excludeIds: string[]
): Promise<string | null> {
  // Find bills with different topics
  const bills = await prisma.bill.findMany({
    where: {
      id: { notIn: excludeIds },
      topicTags: { isEmpty: false },
    },
    take: 100,
  });

  // Find bill with least topic overlap
  let minOverlap = Infinity;
  let opposingBill: string | null = null;

  for (const bill of bills) {
    const overlap = bill.topicTags.filter((t) =>
      currentBillTopics.includes(t)
    ).length;
    if (overlap < minOverlap) {
      minOverlap = overlap;
      opposingBill = bill.id;
    }
  }

  return opposingBill;
}
