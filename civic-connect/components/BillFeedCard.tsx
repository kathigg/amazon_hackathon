"use client";
import Link from "next/link";
import { useState } from "react";
import { Heart, MessageCircle, Share2, Bookmark, TrendingUp } from "lucide-react";

interface BillFeedCardProps {
  id: string;
  title: string;
  plainLanguage?: string;
  status: string;
  sponsor: string;
  topicTags: string[];
  introducedAt: Date;
  viewCount: number;
  isPersonalized?: boolean;
}

export default function BillFeedCard({
  id,
  title,
  plainLanguage,
  status,
  sponsor,
  topicTags,
  introducedAt,
  viewCount,
  isPersonalized,
}: BillFeedCardProps) {
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);

  const timeAgo = getTimeAgo(introducedAt);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-civic-blue to-civic-red flex items-center justify-center text-white font-bold text-sm">
              {id.split("-")[0].toUpperCase()}
            </div>
            <div>
              <Link href={`/bill/${id}`} className="font-semibold text-navy hover:text-civic-blue">
                {id.toUpperCase()}
              </Link>
              <p className="text-xs text-gray-500">
                Sponsored by {sponsor} · {timeAgo}
              </p>
            </div>
          </div>
          {isPersonalized && (
            <span className="flex items-center gap-1 text-xs bg-civic-gold/10 text-civic-gold px-2 py-1 rounded-full">
              <TrendingUp size={12} />
              For You
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <Link href={`/bill/${id}`} className="block p-4 hover:bg-gray-50 transition-colors">
        <h3 className="font-bold text-navy text-lg mb-2 leading-tight line-clamp-2">
          {title}
        </h3>
        
        {plainLanguage && (
          <p className="text-gray-600 text-sm leading-relaxed line-clamp-3 mb-3">
            {plainLanguage}
          </p>
        )}

        {/* Tags */}
        <div className="flex flex-wrap gap-2 mb-3">
          {topicTags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-xs bg-blue-50 text-civic-blue px-3 py-1 rounded-full font-medium"
            >
              {tag}
            </span>
          ))}
          {topicTags.length > 3 && (
            <span className="text-xs text-gray-400 px-2 py-1">
              +{topicTags.length - 3} more
            </span>
          )}
        </div>

        {/* Status badge */}
        <div className="inline-flex items-center gap-2 text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          {status}
        </div>
      </Link>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <button
            onClick={() => setLiked(!liked)}
            className={`flex items-center gap-2 text-sm transition-colors ${
              liked ? "text-red-500" : "text-gray-500 hover:text-red-500"
            }`}
          >
            <Heart size={18} fill={liked ? "currentColor" : "none"} />
            <span className="font-medium">{liked ? "Liked" : "Support"}</span>
          </button>
          
          <Link
            href={`/bill/${id}#discussion`}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-civic-blue transition-colors"
          >
            <MessageCircle size={18} />
            <span className="font-medium">Discuss</span>
          </Link>
          
          <button className="flex items-center gap-2 text-sm text-gray-500 hover:text-civic-blue transition-colors">
            <Share2 size={18} />
            <span className="font-medium">Share</span>
          </button>
        </div>

        <button
          onClick={() => setSaved(!saved)}
          className={`transition-colors ${
            saved ? "text-civic-gold" : "text-gray-400 hover:text-civic-gold"
          }`}
        >
          <Bookmark size={20} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>

      {/* View count */}
      {viewCount > 0 && (
        <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500">
          {viewCount.toLocaleString()} people viewed this bill
        </div>
      )}
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
