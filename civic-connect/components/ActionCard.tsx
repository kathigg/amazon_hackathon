import Link from "next/link";
import { ExternalLink, Calendar, Users, MapPin, Phone, Globe } from "lucide-react";
import clsx from "clsx";
import { formatTerm } from "@/lib/taxonomy";

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
  Democratic: "bg-blue-100 text-blue-700",
  Republican: "bg-red-100 text-red-700",
  Independent: "bg-purple-100 text-purple-700",
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
  return (
    <div className="card p-6 flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h3 className="font-bold text-navy text-lg">Take Action</h3>
      </div>

      {/* Your Representatives (location-detected) */}
      {viewerReps.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={16} className="text-civic-blue" />
            <h4 className="font-semibold text-sm text-gray-700">
              Your Representatives in {viewerReps[0].state ?? viewerStateName}
            </h4>
          </div>
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
                      className="w-10 h-10 rounded-full object-cover border border-gray-100 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-sm font-bold shrink-0">
                      {rep.name.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-navy truncate">
                        {rep.name}
                      </p>
                      <span className={clsx("tag text-xs px-1.5 py-0", partyColor)}>
                        {rep.party.charAt(0)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{rep.office}</p>
                    <div className="flex items-center gap-3 mt-1">
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
            <p className="text-xs text-gray-500 mt-3">
              Showing {MAX_VISIBLE_REPS} of {viewerReps.length}. Enter your ZIP for
              your specific House district.
            </p>
          )}
        </div>
      )}

      {/* Orgs */}
      {orgs.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Users size={16} className="text-civic-blue" />
            <h4 className="font-semibold text-sm text-gray-700">Active Organizations</h4>
          </div>
          <ul className="space-y-4">
            {orgs.slice(0, 3).map((org) => {
              const matchedTags = billTags.length
                ? org.topicTags.filter((t) => billTags.includes(t))
                : [];
              return (
                <li key={org.id} className="flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-navy">{org.name}</p>
                      <p className="text-xs text-gray-500 line-clamp-1">{org.mission}</p>
                    </div>
                    {org.website && (
                      <a
                        href={org.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-civic-blue hover:text-navy shrink-0"
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
                          className="tag bg-civic-blue/10 text-civic-blue text-xs px-2 py-0.5"
                        >
                          {formatTerm(tag)}
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

      {/* Events */}
      {events.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={16} className="text-civic-red" />
            <h4 className="font-semibold text-sm text-gray-700">Upcoming Events</h4>
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
        <p className="text-sm text-gray-400 italic">No organizations or events found for this bill yet.</p>
      )}

      {/* Contact Reps CTA — opens in new tab */}
      <Link
        href={`/bill/${billId}/contact`}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary text-center text-sm"
      >
        {viewerReps.length > 0
          ? "Search by a Different ZIP"
          : "Find Your Representatives"}
      </Link>
    </div>
  );
}
