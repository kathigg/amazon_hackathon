import Link from "next/link";
import {
  Calendar,
  ExternalLink,
  Globe,
  MapPin,
  Phone,
  Users,
} from "lucide-react";
import clsx from "clsx";
import { formatTopicTag } from "@/lib/topics";

interface Org {
  id: string;
  name: string;
  mission: string;
  website?: string | null;
  topicTags: string[];
}

interface Event {
  id: string;
  title: string;
  type: string;
  date: Date | string;
  location: string;
  org: { name: string };
}

interface ViewerRep {
  bioguideId: string;
  name: string;
  party: string;
  chamber: string;
  state: string;
  office: string;
  photoUrl?: string;
  websiteUrl?: string;
  phone?: string;
  officeAddress?: string;
}

interface ActionCardProps {
  orgs: Org[];
  events: Event[];
  billId: string;
  billTags?: string[];
  viewerReps?: ViewerRep[];
  viewerStateName?: string | null;
}

const PARTY_COLORS: Record<string, string> = {
  D: "bg-blue-100 text-blue-700",
  R: "bg-red-100 text-red-700",
  I: "bg-stone-200 text-stone-700",
  Democratic: "bg-blue-100 text-blue-700",
  Republican: "bg-red-100 text-red-700",
  Independent: "bg-stone-200 text-stone-700",
};

const MAX_VISIBLE_REPS = 5;

export default function ActionCard({
  orgs,
  events,
  billId,
  billTags = [],
  viewerReps = [],
  viewerStateName = null,
}: ActionCardProps) {
  const locationLabel = viewerReps[0]?.state ?? viewerStateName;

  return (
    <div className="card p-6 flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h3 className="font-bold text-navy text-lg">Take Action</h3>
      </div>

      {viewerReps.length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <MapPin size={16} className="text-civic-blue" />
            <h4 className="font-semibold text-sm text-gray-700">
              Your Senators And House Member
            </h4>
          </div>
          <p className="mb-3 text-xs text-gray-500">
            {locationLabel
              ? `Detected for ${locationLabel}.`
              : "Based on your location or saved ZIP code."}
          </p>
          <ul className="space-y-3">
            {viewerReps.slice(0, MAX_VISIBLE_REPS).map((rep) => {
              const partyColor =
                PARTY_COLORS[rep.party] ?? "bg-gray-100 text-gray-600";

              return (
                <li key={rep.bioguideId} className="flex items-start gap-3">
                  {rep.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={rep.photoUrl}
                      alt={rep.name}
                      className="h-10 w-10 shrink-0 rounded-full border border-gray-100 object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-400">
                      {rep.name.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-navy">
                        {rep.name}
                      </p>
                      <span className={clsx("tag px-1.5 py-0 text-xs", partyColor)}>
                        {rep.party.charAt(0)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{rep.office}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      {rep.phone && (
                        <a
                          href={`tel:${rep.phone.replace(/\D/g, "")}`}
                          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-navy"
                        >
                          <Phone size={11} /> {rep.phone}
                        </a>
                      )}
                      {rep.websiteUrl && (
                        <a
                          href={rep.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-civic-blue hover:underline"
                        >
                          <Globe size={11} /> Website
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {viewerReps.length > MAX_VISIBLE_REPS && (
            <p className="mt-3 text-xs text-gray-500">
              Showing {MAX_VISIBLE_REPS} of {viewerReps.length}. Open the full
              contact page to switch ZIP codes or save different members.
            </p>
          )}
        </div>
      )}

      {orgs.length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Users size={16} className="text-civic-blue" />
            <h4 className="font-semibold text-sm text-gray-700">
              Active Organizations
            </h4>
          </div>
          <ul className="space-y-4">
            {orgs.slice(0, 3).map((org) => {
              const matchedTags = billTags.length
                ? org.topicTags.filter((tag) => billTags.includes(tag))
                : [];

              return (
                <li key={org.id} className="flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-navy">{org.name}</p>
                      <p className="line-clamp-1 text-xs text-gray-500">
                        {org.mission}
                      </p>
                    </div>
                    {org.website && (
                      <a
                        href={org.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-civic-blue hover:text-navy"
                        aria-label={`Visit ${org.name}`}
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                  {matchedTags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {matchedTags.map((tag) => (
                        <span
                          key={tag}
                          className="tag bg-civic-blue/10 px-2 py-0.5 text-xs text-civic-blue"
                        >
                          {formatTopicTag(tag)}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {events.length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Calendar size={16} className="text-civic-red" />
            <h4 className="font-semibold text-sm text-gray-700">
              Upcoming Events
            </h4>
          </div>
          <ul className="space-y-3">
            {events.slice(0, 3).map((event) => (
              <li key={event.id} className="border-l-2 border-civic-red pl-3">
                <p className="text-sm font-medium text-navy">{event.title}</p>
                <p className="text-xs text-gray-500">
                  {new Date(event.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  · {event.location}
                </p>
                <p className="text-xs text-gray-400">{event.org.name}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {orgs.length === 0 && events.length === 0 && (
        <p className="text-sm italic text-gray-400">
          No organizations or upcoming events are linked to this bill yet.
        </p>
      )}

      <Link
        href={`/bill/${billId}/contact`}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary text-center text-sm"
      >
        {viewerReps.length > 0
          ? "Update Your ZIP Or Saved Members"
          : "Find Your Representatives"}
      </Link>
    </div>
  );
}
