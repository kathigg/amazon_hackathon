import Link from "next/link";
import { ExternalLink, Calendar, Users } from "lucide-react";

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

interface ActionCardProps {
  orgs: Org[];
  events: Event[];
  billId: string;
}

export default function ActionCard({ orgs, events, billId }: ActionCardProps) {
  return (
    <div className="card p-6 flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h3 className="font-bold text-navy text-lg">Take Action</h3>
      </div>

      {/* Orgs */}
      {orgs.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Users size={16} className="text-civic-blue" />
            <h4 className="font-semibold text-sm text-gray-700">Active Organizations</h4>
          </div>
          <ul className="space-y-3">
            {orgs.slice(0, 3).map((org) => (
              <li key={org.id} className="flex items-start justify-between gap-2">
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
              </li>
            ))}
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

      {/* Contact Reps CTA */}
      <Link
        href={`/bill/${billId}/contact`}
        className="btn-primary text-center text-sm"
      >
        Contact Your Representatives
      </Link>
    </div>
  );
}
