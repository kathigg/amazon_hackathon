import { prisma } from "./prisma";
import { normalizeTopicTags } from "./topics";

export async function getRelatedOrganizationsAndEvents(
  topicTags: string[],
  options?: {
    orgLimit?: number;
    eventLimit?: number;
  }
) {
  const normalizedTopicTags = normalizeTopicTags(topicTags);
  const orgLimit = options?.orgLimit ?? 3;
  const eventLimit = options?.eventLimit ?? 3;

  const organizations = await prisma.organization.findMany({
    where:
      normalizedTopicTags.length > 0
        ? {
            topicTags: {
              hasSome: normalizedTopicTags,
            },
          }
        : undefined,
    include: {
      events: {
        where: {
          date: {
            gte: new Date(),
          },
        },
        orderBy: {
          date: "asc",
        },
        take: 2,
      },
    },
  });

  const baseOrganizations =
    organizations.length > 0
      ? organizations
      : await prisma.organization.findMany({
          include: {
            events: {
              where: {
                date: {
                  gte: new Date(),
                },
              },
              orderBy: {
                date: "asc",
              },
              take: 2,
            },
          },
          take: orgLimit,
          orderBy: {
            createdAt: "desc",
          },
        });

  const rankedOrganizations = baseOrganizations
    .map((organization) => ({
      ...organization,
      score:
        organization.topicTags.filter((tag) => normalizedTopicTags.includes(tag as never)).length *
          10 +
        Math.max(0, 5 - organization.events.length),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.name.localeCompare(right.name);
    })
    .slice(0, orgLimit);

  const orgIds = rankedOrganizations.map((organization) => organization.id);
  const events = await prisma.event.findMany({
    where: {
      orgId: {
        in: orgIds,
      },
      date: {
        gte: new Date(),
      },
    },
    take: eventLimit,
    orderBy: {
      date: "asc",
    },
    include: {
      org: {
        select: {
          name: true,
        },
      },
    },
  });

  return {
    orgs: rankedOrganizations,
    events,
  };
}
