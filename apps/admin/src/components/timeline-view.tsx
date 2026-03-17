'use client';

import { EmptyState } from '@medical-crm/ui';
import { Activity } from 'lucide-react';

export interface TimelineEvent {
  id: string;
  type: string;
  description: string;
  actorName?: string;
  actorRole?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

interface TimelineViewProps {
  events: TimelineEvent[];
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getEventColors(type: string): { dot: string; icon: string } {
  const t = type.toUpperCase();
  if (t.includes('STATUS') || t.includes('STAGE')) return { dot: 'bg-indigo-500', icon: 'text-indigo-500' };
  if (t.includes('MESSAGE') || t.includes('CONVERSATION')) return { dot: 'bg-cyan-500', icon: 'text-cyan-500' };
  if (t.includes('DOCUMENT') || t.includes('FILE')) return { dot: 'bg-amber-500', icon: 'text-amber-500' };
  if (t.includes('CONSULTATION')) return { dot: 'bg-purple-500', icon: 'text-purple-500' };
  if (t.includes('HOSPITAL') || t.includes('QUOTE')) return { dot: 'bg-emerald-500', icon: 'text-emerald-500' };
  if (t.includes('CREATE') || t.includes('ASSIGNED')) return { dot: 'bg-blue-500', icon: 'text-blue-500' };
  return { dot: 'bg-slate-400', icon: 'text-slate-400' };
}

function groupEventsByDate(events: TimelineEvent[]): Map<string, TimelineEvent[]> {
  const groups = new Map<string, TimelineEvent[]>();
  for (const event of events) {
    const key = new Date(event.createdAt).toDateString();
    const existing = groups.get(key);
    if (existing) {
      existing.push(event);
    } else {
      groups.set(key, [event]);
    }
  }
  return groups;
}

export function TimelineView({ events }: TimelineViewProps) {
  if (!events || events.length === 0) {
    return (
      <EmptyState
        icon={<Activity size={36} />}
        title="No timeline events"
        description="Events will appear here as the case progresses."
      />
    );
  }

  const sorted = [...events].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const groups = groupEventsByDate(sorted);

  return (
    <div className="space-y-8">
      {Array.from(groups.entries()).map(([dateKey, dayEvents]) => (
        <div key={dateKey}>
          {/* Date divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="px-3 py-1 bg-slate-100 text-slate-500 text-xs font-semibold rounded-full whitespace-nowrap">
              {formatDate(dayEvents[0]!.createdAt)}
            </span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* Events for this day */}
          <div className="relative pl-8 space-y-4">
            {/* Vertical line */}
            <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-200" />

            {dayEvents.map((event) => {
              const colors = getEventColors(event.type);
              return (
                <div key={event.id} className="relative">
                  {/* Dot */}
                  <div
                    className={`absolute -left-5 mt-1 w-4 h-4 rounded-full border-2 border-white shadow-sm ${colors.dot}`}
                  />

                  <div className="bg-white rounded-xl border border-slate-100 px-4 py-3 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${colors.icon} bg-slate-50 border border-slate-100`}
                          >
                            {event.type.replace(/_/g, ' ')}
                          </span>
                          {event.actorName && (
                            <span className="text-xs text-slate-400">
                              by{' '}
                              <span className="font-medium text-slate-600">
                                {event.actorName}
                              </span>
                              {event.actorRole && (
                                <span className="ml-1 text-slate-400">
                                  ({event.actorRole})
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-700">{event.description}</p>
                      </div>
                      <span className="text-[11px] text-slate-400 shrink-0 mt-0.5">
                        {formatTime(event.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
