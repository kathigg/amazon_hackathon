import { ExternalLink, Calendar } from "lucide-react";
import RsvpButton from "./RsvpButton";

interface Event {
  id: string;
  title: string;
  type: string;
  date: Date | string;
  location: string;
}

interface Org {
  id: string;
  name: string;
  mission: string;
  website?: string | null;
  topicTags: string[];
  location?: string | null;
  events: Event[];
}

export default function OrgCard({ org }: { org: Org }) {
  return (
    <div className="card p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-navy text-lg leading-tight">{org.name}</h3>
          {org.location && (
            <p className="text-xs text-gray-400 mt-0.5">{org.location}</p>
          )}
        </div>
        {org.website && (
          <a
            href={org.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-civic-blue hover:text-navy shrink-0 mt-1"
            aria-label={`Visit ${org.name}`}
          >
            <ExternalLink size={16} />
          </a>
        )}
      </div>

      <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">{org.mission}</p>

      {/* Topic tags */}
      <div className="flex flex-wrap gap-1">
        {org.topicTags.slice(0, 3).map((tag) => (
          <span key={tag} className="tag bg-blue-50 text-civic-blue text-xs px-2 py-0.5">
            {tag}
          </span>
        ))}
      </div>

      {/* Upcoming events */}
      {org.events.length > 0 && (
        <div className="border-t border-gray-100 pt-4">
          <div className="flex items-center gap-1 mb-3">
            <Calendar size={14} className="text-civic-red" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Upcoming Events</span>
          </div>
          <ul className="space-y-3">
            {org.events.map((event) => (
              <li key={event.id} className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-navy">{event.title}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(event.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    · {event.location}
                  </p>
                </div>
                <RsvpButton eventId={event.id} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
