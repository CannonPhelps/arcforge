"use client";

import { useMemo, useState, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCog,
  faQuestionCircle,
  faShareNodes,
  faTimes,
  faCheck,
  faDiagramProject,
  faArrowRight,
} from "@fortawesome/free-solid-svg-icons";
import itemsRelationData from "../../../data/items_relation.json";
import TableSettingsPanel from "./TableSettingsPanel";
import HelpPanel from "./HelpPanel";
import { ItemData } from "../../types/graph";
import { cleanRelationName, formatEdgeLabel, getEdgePriority } from "../../utils/graphHelpers";
import { useTranslation } from "../../i18n";
import ErrorState from "./ErrorState";
import type { CraftingLayout } from "../graph/CraftingGraphModal";

interface CraftingTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemName: string;
  onItemChange: (itemName: string) => void;
  layout?: CraftingLayout;
  onLayoutChange?: (layout: CraftingLayout) => void;
}

export default function CraftingTableModal({
  isOpen,
  onClose,
  itemName,
  onItemChange,
  layout = "table",
  onLayoutChange,
}: CraftingTableModalProps) {
  const { t, tItem } = useTranslation();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [showCopied, setShowCopied] = useState(false);

  // Edge type filters - default to all types
  const [selectedEdgeTypes, setSelectedEdgeTypes] = useState<Set<string>>(
    () => new Set(["craft", "repair", "recycle", "salvage", "upgrade", "trade"]),
  );

  // Find the selected item and build item lookup
  const { selectedItem, itemsLookup } = useMemo(() => {
    const lookup = new Map<string, ItemData>();
    (itemsRelationData as ItemData[]).forEach((item) => {
      lookup.set(item.name, item);
    });
    const selected = lookup.get(itemName);
    return { selectedItem: selected, itemsLookup: lookup };
  }, [itemName]);

  // Memoize translation functions
  const translateItem = useCallback((name: string) => tItem(name), [tItem]);
  const translateRelation = useCallback((key: string) => t(key), [t]);

  // Handle item navigation within the modal
  const handleItemSelect = useCallback(
    (name: string) => {
      setIsHelpOpen(false);
      setIsSettingsOpen(false);
      onItemChange(name);
    },
    [onItemChange],
  );

  // Handle share button click
  const handleShare = useCallback(async () => {
    const shareUrl =
      layout === "table"
        ? `${window.location.origin}/?graph=${encodeURIComponent(itemName)}&layout=table`
        : `${window.location.origin}/?graph=${encodeURIComponent(itemName)}`;
    const shareData = {
      title: `${tItem(itemName)} - ARC Forge Crafting Table`,
      text: t("graph.shareText") || `Check out the crafting table for ${tItem(itemName)}`,
      url: shareUrl,
    };

    // Try Web Share API first (mobile)
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        // User cancelled or share failed, fall back to clipboard
        if ((err as Error).name === "AbortError") return;
      }
    }

    // Fall back to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    }
  }, [itemName, t, tItem, layout]);

  const currentItem = useMemo(() => itemsLookup.get(itemName), [itemsLookup, itemName]);

  const rows = useMemo(() => {
    if (!currentItem) return [];

    const currentThumb = currentItem.image_urls?.thumb
      ? `/api/proxy-image?url=${encodeURIComponent(currentItem.image_urls.thumb)}`
      : "";

    const shouldIncludeEdge = (relation: string): boolean => {
      if (!selectedEdgeTypes) return true;
      if (selectedEdgeTypes.size === 0) return false;

      const cleaned = cleanRelationName(relation);
      if (cleaned === "trader" || cleaned === "sold_by") {
        return selectedEdgeTypes.has("trade");
      }
      return selectedEdgeTypes.has(cleaned);
    };

    const raw = currentItem.edges
      .filter((edge) => shouldIncludeEdge(edge.relation))
      .map((edge, idx) => {
        const cleaned = cleanRelationName(edge.relation);
        const relationKey = cleaned === "trader" || cleaned === "sold_by" ? "trade" : cleaned;
        const relationLabel = translateRelation
          ? translateRelation(`graph.${relationKey}`)
          : relationKey;

        // Extra detail: price (trade) or level item (recycle/salvage/etc)
        let detail = "";
        if (edge.relation === "trader" || edge.relation === "sold_by") {
          const priceDep = edge.dependency?.find((d) => d.type === "price") as
            | { type: "price"; amount?: string | number; currency?: string }
            | undefined;
          if (priceDep?.amount != null && priceDep?.currency) {
            detail = `${priceDep.amount} ${priceDep.currency}`;
          }
        } else {
          const levelInfo = edge.input_level || edge.output_level;
          if (levelInfo) {
            detail = translateItem ? translateItem(levelInfo) : levelInfo;
          }
        }

        const fromName = edge.direction === "in" ? edge.name : currentItem.name;
        const toName = edge.direction === "in" ? currentItem.name : edge.name;

        const fromItem = itemsLookup.get(fromName);
        const toItem = itemsLookup.get(toName);

        const fromThumb =
          fromName === currentItem.name
            ? currentThumb
            : fromItem?.image_urls?.thumb
              ? `/api/proxy-image?url=${encodeURIComponent(fromItem.image_urls.thumb)}`
              : "";

        const toThumb =
          toName === currentItem.name
            ? currentThumb
            : toItem?.image_urls?.thumb
              ? `/api/proxy-image?url=${encodeURIComponent(toItem.image_urls.thumb)}`
              : "";

        return {
          key: `${edge.direction}:${edge.name}:${edge.relation}:${idx}`,
          edge,
          relationKey,
          relationLabel,
          label: formatEdgeLabel(edge, translateRelation, translateItem),
          detail,
          fromName,
          toName,
          fromThumb,
          toThumb,
        };
      });

    raw.sort((a, b) => {
      // Show outputs first (current -> other), then inputs (other -> current)
      const dirA = a.edge.direction === "out" ? 0 : 1;
      const dirB = b.edge.direction === "out" ? 0 : 1;
      if (dirA !== dirB) return dirA - dirB;

      const prio = getEdgePriority(a.edge) - getEdgePriority(b.edge);
      if (prio !== 0) return prio;

      return a.fromName.localeCompare(b.fromName) || a.toName.localeCompare(b.toName);
    });

    return raw;
  }, [currentItem, itemsLookup, selectedEdgeTypes, translateItem, translateRelation]);

  const getRelationBorderClass = (relationKey: string) => {
    const borders: Record<string, string> = {
      craft: "border-blue-500/50",
      repair: "border-red-500/50",
      recycle: "border-emerald-500/50",
      salvage: "border-green-500/50",
      upgrade: "border-pink-500/50",
      trade: "border-amber-500/50",
    };

    return borders[relationKey] ?? "border-white/10";
  };

  const getRelationColor = (relationKey: string) => {
    const borders: Record<string, string> = {
      craft: "text-blue-500",
      repair: "text-red-500",
      recycle: "text-emerald-500",
      salvage: "text-green-500",
      upgrade: "text-pink-500",
      trade: "text-amber-500",
    };

    return borders[relationKey] ?? "border-white/10";
  };

  if (!isOpen) return null;

  if (!selectedItem) {
    return (
      /* Modal Container - positioned below header using margin-top */
      <div className="fixed inset-0 z-30 mt-16 sm:mt-20 md:mt-24 flex flex-col bg-[#07020b]">
        {/* Top Right Buttons */}
        <div className="absolute top-4 right-4 z-30 flex items-center gap-3">
          {/* Layout Toggle */}
          {onLayoutChange && (
            <button
              onClick={() => onLayoutChange("graph")}
              className="w-12 h-12 flex items-center justify-center bg-linear-to-br from-indigo-500/30 to-purple-500/20 backdrop-blur-xl rounded-full shadow-2xl hover:from-indigo-500/40 hover:to-purple-500/30 transition-all duration-300 border border-white/20 hover:border-white/30 hover:scale-105"
              aria-label={t("item.craftingGraph")}
              title={t("item.craftingGraph")}
            >
              <FontAwesomeIcon icon={faDiagramProject} className="text-white text-xl" />
            </button>
          )}
          {/* Share Button */}
          <button
            onClick={handleShare}
            className="w-12 h-12 flex items-center justify-center bg-linear-to-br from-emerald-500/30 to-teal-500/20 backdrop-blur-xl rounded-full shadow-2xl hover:from-emerald-500/40 hover:to-teal-500/30 transition-all duration-300 border border-white/20 hover:border-white/30 hover:scale-105"
            aria-label={t("buttons.share")}
          >
            <FontAwesomeIcon
              icon={showCopied ? faCheck : faShareNodes}
              className={`text-xl transition-colors duration-200 ${showCopied ? "text-emerald-400" : "text-white"}`}
            />
          </button>
          {/* Close Button */}
          <button
            onClick={onClose}
            className="w-12 h-12 flex items-center justify-center bg-linear-to-br from-red-500/30 to-pink-500/20 backdrop-blur-xl rounded-full shadow-2xl hover:from-red-500/40 hover:to-pink-500/30 transition-all duration-300 border border-white/20 hover:border-white/30 hover:scale-105"
            aria-label={t("buttons.close")}
          >
            <FontAwesomeIcon icon={faTimes} className="text-white text-xl" />
          </button>
        </div>
        <ErrorState itemName={itemName} />
      </div>
    );
  }

  return (
    /* Modal Container - positioned below header using margin-top matching header heights */
    <div className="fixed inset-0 z-30 mt-16 sm:mt-20 md:mt-24 flex flex-col bg-[#07020b] text-gray-100 overflow-hidden overscroll-contain">
      {/* Top Right Buttons */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-3">
        {/* Layout Toggle */}
        {onLayoutChange && (
          <button
            onClick={() => onLayoutChange("graph")}
            className="w-12 h-12 flex items-center justify-center bg-linear-to-br from-indigo-500/30 to-purple-500/20 backdrop-blur-xl rounded-full shadow-2xl hover:from-indigo-500/40 hover:to-purple-500/30 transition-all duration-300 border border-white/20 hover:border-white/30 hover:scale-105"
            aria-label={t("item.craftingGraph")}
            title={t("item.craftingGraph")}
          >
            <FontAwesomeIcon icon={faDiagramProject} className="text-white text-xl" />
          </button>
        )}
        {/* Share Button */}
        <button
          onClick={handleShare}
          className="w-12 h-12 flex items-center justify-center bg-linear-to-br from-emerald-500/30 to-teal-500/20 backdrop-blur-xl rounded-full shadow-2xl hover:from-emerald-500/40 hover:to-teal-500/30 transition-all duration-300 border border-white/20 hover:border-white/30 hover:scale-105"
          aria-label={t("buttons.share")}
        >
          <FontAwesomeIcon
            icon={showCopied ? faCheck : faShareNodes}
            className={`text-xl transition-colors duration-200 ${showCopied ? "text-emerald-400" : "text-white"}`}
          />
        </button>
        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-12 h-12 flex items-center justify-center bg-linear-to-br from-red-500/30 to-pink-500/20 backdrop-blur-xl rounded-full shadow-2xl hover:from-red-500/40 hover:to-pink-500/30 transition-all duration-300 border border-white/20 hover:border-white/30 hover:scale-105"
          aria-label={t("buttons.close")}
        >
          <FontAwesomeIcon icon={faTimes} className="text-white text-xl" />
        </button>
      </div>

      {/* Help Button */}
      <button
        onClick={() => setIsHelpOpen(true)}
        className="absolute bottom-28 right-8 z-30 w-14 h-14 flex items-center justify-center bg-linear-to-br from-blue-500/30 to-cyan-500/20 backdrop-blur-xl rounded-full shadow-2xl hover:from-blue-500/40 hover:to-cyan-500/30 transition-all duration-300 border border-white/20 hover:border-white/30 hover:shadow-blue-500/50 hover:scale-105"
        aria-label={t("buttons.openHelp")}
      >
        <div className="absolute inset-0 bg-linear-to-br from-white/10 to-transparent rounded-full pointer-events-none"></div>
        <FontAwesomeIcon
          icon={faQuestionCircle}
          className="text-white text-xl relative z-10 drop-shadow-lg"
        />
      </button>

      {/* Settings Button */}
      <button
        onClick={() => setIsSettingsOpen(true)}
        className="absolute bottom-8 right-8 z-30 w-14 h-14 flex items-center justify-center bg-linear-to-br from-purple-500/30 to-pink-500/20 backdrop-blur-xl rounded-full shadow-2xl hover:from-purple-500/40 hover:to-pink-500/30 transition-all duration-300 border border-white/20 hover:border-white/30 hover:shadow-purple-500/50 hover:scale-105"
        aria-label={t("buttons.openRelationFilters")}
      >
        <div className="absolute inset-0 bg-linear-to-br from-white/10 to-transparent rounded-full pointer-events-none"></div>
        <FontAwesomeIcon icon={faCog} className="text-white text-xl relative z-10 drop-shadow-lg" />
      </button>

      {/* Graph Canvas */}
      <div className="flex-1 relative bg-[#07020b] overflow-hidden overscroll-contain">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at center, rgba(139, 92, 246, 0.06) 0%, rgba(7, 2, 11, 1) 100%)",
          }}
        />

        <div className="relative z-10 h-full overflow-y-auto overscroll-contain px-4 py-6 md:px-8 md:py-8">
          {/* Header */}
          <div className="mb-6 flex flex-col gap-2">
            <div className="text-xs uppercase tracking-widest text-purple-300/80 font-semibold">
              {t("item.craftingTable")}
            </div>
            <div className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-linear-to-r from-gray-100 via-purple-200 to-gray-100 drop-shadow-lg">
              {tItem(itemName)}
            </div>
          </div>

          {/* Row-based From → To layout */}
          <div className="shadow-2xl divide-purple-500/10 overflow-hidden">
            {rows.length === 0 ? (
              <div className="px-5 py-6 text-sm text-gray-400">
                No matching relations (check filters).
              </div>
            ) : (
              <div className="divide-y divide-purple-500/10">
                {rows.map((row) => {
                  const fromIsCurrent = row.fromName === itemName;
                  const toIsCurrent = row.toName === itemName;

                  return (
                    <div
                      key={row.key}
                      className="px-5 py-4 hover:bg-purple-500/10 transition-colors"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-center">
                        {/* From */}
                        <button
                          onClick={() => !fromIsCurrent && handleItemSelect(row.fromName)}
                          disabled={fromIsCurrent}
                          className={`w-full text-left flex items-center gap-3 ${fromIsCurrent ? "opacity-90 cursor-default" : "hover:brightness-110"}`}
                        >
                          <div className="w-24 h-24 rounded-xl bg-black/40 border border-purple-500/20 flex items-center justify-center overflow-hidden shrink-0">
                            {row.fromThumb ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={row.fromThumb}
                                alt={tItem(row.fromName)}
                                className="w-full h-full object-contain"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="text-gray-600 text-sm">?</div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-gray-100 truncate text-2xl">
                              {tItem(row.fromName)}
                            </div>
                            <div className="text-xs text-gray-500">
                              {fromIsCurrent ? "Selected item" : "Tap to open"}
                            </div>
                          </div>
                        </button>

                        {/* Relation */}
                        <div
                          className={`flex flex-col items-center md:items-center gap-2 rounded-xl border ${getRelationBorderClass(
                            row.relationKey,
                          )} bg-black/25 px-3 py-2`}
                        >
                          <div className="flex items-center gap-3">
                            <p className={`text-2xl ${getRelationColor(row.relationKey)}`}>
                              {row.relationLabel}
                            </p>
                          </div>
                          <FontAwesomeIcon
                            icon={faArrowRight}
                            className={`text-4xl ${getRelationColor(row.relationKey)}`}
                          />

                          {row.detail && (
                            <div className="text-xs text-purple-200/90 text-center">
                              {row.detail}
                            </div>
                          )}
                        </div>

                        {/* To */}
                        <button
                          onClick={() => !toIsCurrent && handleItemSelect(row.toName)}
                          disabled={toIsCurrent}
                          className={`w-full text-left md:text-right flex md:flex-row-reverse items-center gap-3 ${toIsCurrent ? "opacity-90 cursor-default" : "hover:brightness-110"}`}
                        >
                          <div className="w-24 h-24 rounded-xl bg-black/40 border border-purple-500/20 flex items-center justify-center overflow-hidden shrink-0">
                            {row.toThumb ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={row.toThumb}
                                alt={tItem(row.toName)}
                                className="w-full h-full object-contain"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="text-gray-600 text-sm">?</div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-gray-100 truncate text-2xl">
                              {tItem(row.toName)}
                            </div>
                            <div className="text-xs text-gray-500">
                              {toIsCurrent ? "Current item" : "Tap to open"}
                            </div>
                          </div>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Help Panel */}
      <HelpPanel isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

      {/* Settings Panel */}
      <TableSettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        selectedEdgeTypes={selectedEdgeTypes}
        setSelectedEdgeTypes={setSelectedEdgeTypes}
      />
    </div>
  );
}
