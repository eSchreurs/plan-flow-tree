import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Lock, Minus, Plus } from "lucide-react";
import type { ID, PlanItem } from "@/lib/types";
import { childrenMap, computeBlocked } from "@/lib/logic";
import {
  dayToIso,
  formatDay,
  scheduleProject,
  weekdayOf,
  type ScheduleEntry,
} from "@/lib/schedule";
import { COLOR_HEX, EDGE_PENDING, EDGE_SATISFIED } from "@/lib/colors";
import { updateItem } from "@/lib/store";
import type { ViewProps } from "./CanvasView";

const LABEL_W = 264;
const ROW_H = 34;
const HEADER_H = 46;

interface DragState {
  itemId: ID;
  mode: "move" | "resize-l" | "resize-r";
  startClientX: number;
  origin: ScheduleEntry;
  deltaDays: number;
}

/** Fully time-based Gantt: explicit dates are solid, derived ones faded. */
export function TimelineView({
  project,
  selection,
  setSelection,
  visible,
  openMenu,
  focus,
}: ViewProps) {
  const [collapsed, setCollapsed] = useState<Set<ID>>(new Set());
  const [dayWidth, setDayWidth] = useState(16);
  const [drag, setDrag] = useState<DragState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastFocus = useRef(0);

  const children = useMemo(() => childrenMap(project.items), [project.items]);
  const blocked = useMemo(
    () => computeBlocked(project.items, project.deps),
    [project.items, project.deps],
  );
  const schedule = useMemo(
    () => scheduleProject(project.items, project.deps),
    [project.items, project.deps],
  );

  const rows = useMemo(() => {
    const list: { item: PlanItem; depth: number }[] = [];
    const walk = (item: PlanItem, depth: number) => {
      list.push({ item, depth });
      if (!collapsed.has(item.id)) {
        for (const kid of children.get(item.id) ?? []) walk(kid, depth + 1);
      }
    };
    for (const root of children.get(null) ?? []) walk(root, 0);
    return list;
  }, [children, collapsed]);
  const rowIndex = useMemo(() => new Map(rows.map((row, index) => [row.item.id, index])), [rows]);

  const rangeMin = schedule.min - 3;
  const rangeMax = schedule.max + 7;
  const days = rangeMax - rangeMin;
  const gridW = days * dayWidth;
  const xOf = (day: number) => (day - rangeMin) * dayWidth;

  const entryOf = (id: ID): ScheduleEntry => {
    const base = schedule.entries.get(id)!;
    if (drag && drag.itemId === id) {
      const d = drag.deltaDays;
      if (drag.mode === "move")
        return { ...base, start: drag.origin.start + d, end: drag.origin.end + d };
      if (drag.mode === "resize-r")
        return { ...base, end: Math.max(drag.origin.start + 1, drag.origin.end + d) };
      return { ...base, start: Math.min(drag.origin.end - 1, drag.origin.start + d) };
    }
    return base;
  };

  const beginDrag = (e: React.PointerEvent, item: PlanItem, mode: DragState["mode"]) => {
    const isParent = (children.get(item.id) ?? []).length > 0;
    const entry = schedule.entries.get(item.id)!;
    // Derived parent bars are read-only; leaves and explicitly dated items move.
    if (isParent && !entry.explicitStart && !entry.explicitEnd) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ itemId: item.id, mode, startClientX: e.clientX, origin: entry, deltaDays: 0 });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const deltaDays = Math.round((e.clientX - drag.startClientX) / dayWidth);
    if (deltaDays !== drag.deltaDays) setDrag({ ...drag, deltaDays });
  };

  const endDrag = (item: PlanItem) => {
    if (!drag) return;
    if (drag.deltaDays === 0) {
      setSelection({ kind: "item", id: item.id });
    } else {
      const final = entryOf(item.id);
      // Materialize what you see: both dates become explicit (endDate inclusive).
      updateItem(project.id, item.id, {
        startDate: dayToIso(final.start),
        endDate: dayToIso(final.end - 1),
      });
      setSelection({ kind: "item", id: item.id });
    }
    setDrag(null);
  };

  // Drawer navigation: scroll the requested row + bar into view.
  useEffect(() => {
    if (!focus || focus.n === lastFocus.current) return;
    lastFocus.current = focus.n;
    const index = rowIndex.get(focus.id);
    const entry = schedule.entries.get(focus.id);
    const el = scrollRef.current;
    if (index === undefined || !entry || !el) return;
    el.scrollTo({
      top: Math.max(0, index * ROW_H - el.clientHeight / 2 + HEADER_H),
      left: Math.max(0, (entry.start - rangeMin) * dayWidth - 160),
      behavior: "smooth",
    });
  }, [focus, rowIndex, schedule, rangeMin, dayWidth]);

  // Month segments + Monday ticks for the header.
  const months = useMemo(() => {
    const segments: { start: number; end: number; label: string }[] = [];
    let cursor = rangeMin;
    while (cursor < rangeMax) {
      const date = new Date(cursor * 86_400_000);
      const monthEnd = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / 86_400_000;
      const end = Math.min(rangeMax, monthEnd);
      segments.push({
        start: cursor,
        end,
        label: date.toLocaleDateString(undefined, { month: "short", year: "numeric" }),
      });
      cursor = end;
    }
    return segments;
  }, [rangeMin, rangeMax]);
  const mondays = useMemo(() => {
    const list: number[] = [];
    for (let day = rangeMin; day < rangeMax; day++) if (weekdayOf(day) === 0) list.push(day);
    return list;
  }, [rangeMin, rangeMax]);

  const mondayOffset = weekdayOf(rangeMin);
  const gridBackground: React.CSSProperties = {
    backgroundImage: `repeating-linear-gradient(to right, rgba(148,163,184,0.28) 0 1px, transparent 1px ${7 * dayWidth}px), repeating-linear-gradient(to right, transparent 0 ${5 * dayWidth}px, rgba(226,232,240,0.35) ${5 * dayWidth}px ${7 * dayWidth}px)`,
    backgroundPositionX: `${-mondayOffset * dayWidth}px`,
  };

  return (
    <div className="relative min-w-0 flex-1 bg-white" data-testid="timeline-view">
      <div ref={scrollRef} className="h-full w-full overflow-auto">
        <div className="relative" style={{ width: LABEL_W + gridW, minHeight: "100%" }}>
          {/* header */}
          <div
            className="sticky top-0 z-30 flex border-b border-slate-200 bg-white"
            style={{ height: HEADER_H }}
          >
            <div
              className="sticky left-0 z-40 flex shrink-0 items-end border-r border-slate-200 bg-white px-3 pb-1 text-[10.5px] font-semibold tracking-wider text-slate-400 uppercase"
              style={{ width: LABEL_W }}
            >
              Task
            </div>
            <div className="relative" style={{ width: gridW }}>
              {months.map((m) => (
                <div
                  key={m.start}
                  className="absolute top-1 truncate border-l border-slate-200 pl-1.5 text-[11px] font-semibold text-slate-500"
                  style={{ left: xOf(m.start), width: (m.end - m.start) * dayWidth }}
                >
                  {m.label}
                </div>
              ))}
              {mondays.map((day) => (
                <div
                  key={day}
                  className="absolute bottom-0.5 text-[10px] text-slate-400"
                  style={{ left: xOf(day) + 3 }}
                >
                  {new Date(day * 86_400_000).getUTCDate()}
                </div>
              ))}
            </div>
          </div>

          {/* grid background + today + dependency arrows */}
          <div
            className="pointer-events-none absolute"
            style={{ left: LABEL_W, top: HEADER_H, width: gridW, height: rows.length * ROW_H }}
          >
            <div className="absolute inset-0" style={gridBackground} />
            <svg className="absolute inset-0 h-full w-full overflow-visible">
              {project.deps.map((dep) => {
                const from = rowIndex.get(dep.source);
                const to = rowIndex.get(dep.target);
                if (from === undefined || to === undefined) return null;
                const sourceEntry = entryOf(dep.source);
                const targetEntry = entryOf(dep.target);
                const x1 = xOf(sourceEntry.end);
                const y1 = from * ROW_H + ROW_H / 2;
                const x2 = xOf(targetEntry.start);
                const y2 = to * ROW_H + ROW_H / 2;
                const satisfied = project.items.find((i) => i.id === dep.source)?.done ?? false;
                const color = satisfied ? EDGE_SATISFIED : EDGE_PENDING;
                const dimmed =
                  visible !== null && (!visible.has(dep.source) || !visible.has(dep.target));
                const bend = Math.max(10, Math.min(24, (x2 - x1) / 2));
                const path =
                  x2 >= x1 + 12
                    ? `M ${x1} ${y1} h ${bend} q 6 0 6 ${y2 > y1 ? 6 : -6} V ${y2 > y1 ? y2 - 6 : y2 + 6} q 0 6 6 6 H ${x2 - 5}`
                    : `M ${x1} ${y1} h 8 q 6 0 6 ${y2 > y1 ? 6 : -6} V ${y2 > y1 ? y2 - 14 : y2 + 14} H ${x2 - 14} V ${y2} H ${x2 - 5}`;
                return (
                  <g key={dep.id} opacity={dimmed ? 0.1 : 0.9}>
                    <path d={path} fill="none" stroke={color} strokeWidth={1.4} />
                    <path
                      d={`M ${x2 - 6} ${y2 - 4} L ${x2} ${y2} L ${x2 - 6} ${y2 + 4} Z`}
                      fill={color}
                    />
                  </g>
                );
              })}
            </svg>
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-red-400"
              style={{ left: xOf(schedule.today) }}
              data-testid="today-line"
            />
          </div>
          <div
            className="pointer-events-none absolute z-30 -translate-x-1/2 rounded-b bg-red-400 px-1.5 py-0.5 text-[9.5px] font-semibold text-white"
            style={{ left: LABEL_W + xOf(schedule.today), top: HEADER_H }}
          >
            Today
          </div>

          {/* rows */}
          {rows.map(({ item, depth }) => {
            const kids = children.get(item.id) ?? [];
            const isParent = kids.length > 0;
            const entry = entryOf(item.id);
            const isBlocked = (blocked.get(item.id)?.blocked ?? false) && !item.done;
            const dimmed = visible !== null && !visible.has(item.id);
            const selected = selection?.kind === "item" && selection.id === item.id;
            const explicit = entry.explicitStart || entry.explicitEnd;
            const draggable = !isParent || explicit;
            const barColor =
              COLOR_HEX[item.color === "slate" && item.type === "task" ? "blue" : item.color];
            return (
              <div
                key={item.id}
                className={`flex ${dimmed ? "opacity-30" : ""}`}
                style={{ height: ROW_H }}
                data-testid={`timeline-row-${item.id}`}
              >
                <div
                  className={`sticky left-0 z-20 flex shrink-0 cursor-pointer items-center gap-1.5 border-r border-b border-slate-100 bg-white pr-2 text-[12px] ${
                    selected ? "bg-blue-50" : "hover:bg-slate-50"
                  }`}
                  style={{ width: LABEL_W, paddingLeft: depth * 14 + 8 }}
                  onClick={() => setSelection({ kind: "item", id: item.id })}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openMenu({ kind: "node", x: e.clientX, y: e.clientY, itemId: item.id });
                  }}
                >
                  <button
                    type="button"
                    aria-label="Toggle children"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      });
                    }}
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200 ${isParent ? "" : "invisible"}`}
                  >
                    <ChevronRight
                      size={12}
                      className={`transition-transform ${collapsed.has(item.id) ? "" : "rotate-90"}`}
                    />
                  </button>
                  <span
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                      item.done
                        ? "border-green-500 bg-green-500 text-white"
                        : isBlocked
                          ? "border-amber-300 bg-amber-50 text-amber-600"
                          : "border-slate-300 bg-white"
                    }`}
                  >
                    {item.done && <Check size={9} strokeWidth={4} />}
                    {!item.done && isBlocked && <Lock size={8} />}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate ${item.done ? "text-slate-400 line-through" : "text-slate-700"} ${item.type === "group" ? "font-semibold" : ""}`}
                  >
                    {item.title || "Untitled"}
                  </span>
                  <span className="shrink-0 text-[10px] text-slate-400 tabular-nums">
                    {formatDay(entry.start)}
                  </span>
                </div>
                <div
                  className="relative border-b border-slate-100"
                  style={{ width: gridW }}
                  onClick={() => setSelection({ kind: "item", id: item.id })}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openMenu({ kind: "node", x: e.clientX, y: e.clientY, itemId: item.id });
                  }}
                >
                  <div
                    className={`absolute rounded-full ${draggable ? "cursor-grab active:cursor-grabbing" : ""} ${selected ? "ring-2 ring-blue-400 ring-offset-1" : ""}`}
                    data-testid={`timeline-bar-${item.id}`}
                    style={{
                      left: xOf(entry.start),
                      width: Math.max(dayWidth, (entry.end - entry.start) * dayWidth),
                      height: isParent ? 10 : 16,
                      top: isParent ? (ROW_H - 10) / 2 : (ROW_H - 16) / 2,
                      background: barColor,
                      opacity: item.done ? 0.45 : explicit ? 0.95 : 0.5,
                      outline: explicit ? "none" : `1.5px dashed ${barColor}`,
                      outlineOffset: 1,
                    }}
                    title={`${formatDay(entry.start)} – ${formatDay(entry.end - 1)}${explicit ? "" : " (auto)"}`}
                    onPointerDown={(e) => beginDrag(e, item, "move")}
                    onPointerMove={onPointerMove}
                    onPointerUp={() => endDrag(item)}
                  >
                    {draggable && (
                      <>
                        <div
                          className="absolute top-0 left-0 h-full w-2 cursor-ew-resize"
                          onPointerDown={(e) => beginDrag(e, item, "resize-l")}
                          onPointerMove={onPointerMove}
                          onPointerUp={() => endDrag(item)}
                        />
                        <div
                          className="absolute top-0 right-0 h-full w-2 cursor-ew-resize"
                          onPointerDown={(e) => beginDrag(e, item, "resize-r")}
                          onPointerMove={onPointerMove}
                          onPointerUp={() => endDrag(item)}
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <div className="p-6 text-[13px] text-slate-400">Nothing to schedule yet.</div>
          )}
        </div>
      </div>

      <div className="absolute bottom-3 left-3 z-40 flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-100"
          onClick={() => setDayWidth((w) => Math.max(8, w - 4))}
          aria-label="Zoom out"
        >
          <Minus size={13} />
        </button>
        <span className="w-10 text-center text-[11px] text-slate-500">{dayWidth}px/d</span>
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-100"
          onClick={() => setDayWidth((w) => Math.min(40, w + 4))}
          aria-label="Zoom in"
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}
