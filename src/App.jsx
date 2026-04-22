import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const DATA_STORAGE_KEY = "effort-heatmap-data";
const SETTINGS_STORAGE_KEY = "effort-heatmap-settings";
const THEME_STORAGE_KEY = "effort-heatmap-theme";

const ALL_TIERS = ["none", "light", "medium", "heavy", "grind"];
const ACTION_TIERS = ["light", "medium", "heavy", "grind"];
const ALL_THEMES = ["dark", "light"];

const TIER_LABELS = {
  none: "None",
  light: "Light",
  medium: "Medium",
  heavy: "Heavy",
  grind: "Grind",
};

const DAY_AXIS_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short" });
const TODAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});
const DATE_READABLE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

function getDefaultSettings() {
  const year = new Date().getFullYear();
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  };
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function isValidDateKey(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return false;
  }

  const parsed = parseDateKey(dateKey);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return toDateKey(parsed) === dateKey;
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function compareDateKeys(left, right) {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function getMondayRowIndex(date) {
  return (date.getDay() + 6) % 7;
}

function readStoredEffortData() {
  const output = {};

  try {
    const raw = localStorage.getItem(DATA_STORAGE_KEY);
    if (!raw) {
      return output;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return output;
    }

    for (const [dateKey, tier] of Object.entries(parsed)) {
      if (
        isValidDateKey(dateKey) &&
        ALL_TIERS.includes(tier) &&
        tier !== "none"
      ) {
        output[dateKey] = tier;
      }
    }

    return output;
  } catch {
    return output;
  }
}

function readStoredSettings() {
  const defaults = getDefaultSettings();

  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return defaults;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return defaults;
    }

    const { startDate, endDate } = parsed;
    if (!isValidDateKey(startDate) || !isValidDateKey(endDate)) {
      return defaults;
    }

    if (compareDateKeys(endDate, startDate) <= 0) {
      return defaults;
    }

    return { startDate, endDate };
  } catch {
    return defaults;
  }
}

function readStoredTheme() {
  try {
    const rawTheme = localStorage.getItem(THEME_STORAGE_KEY);

    if (rawTheme === "color" || rawTheme === "mono") {
      return "dark";
    }

    if (ALL_THEMES.includes(rawTheme)) {
      return rawTheme;
    }
  } catch {
    return "dark";
  }

  return "dark";
}

function writeEffortData(data) {
  localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(data));
}

function writeSettings(settings) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function buildHeatmapModel(startDateKey, endDateKey) {
  const startDate = parseDateKey(startDateKey);
  const endDate = parseDateKey(endDateKey);

  if (compareDateKeys(endDateKey, startDateKey) < 0) {
    return { columns: [], monthLabelByColumn: {} };
  }

  const days = [];
  for (
    let current = new Date(startDate);
    current <= endDate;
    current = addDays(current, 1)
  ) {
    days.push({ key: toDateKey(current), date: new Date(current) });
  }

  const leadingPadding = days.length > 0 ? getMondayRowIndex(days[0].date) : 0;
  const occupiedAfterLeading = leadingPadding + days.length;
  const trailingPadding =
    occupiedAfterLeading % 7 === 0 ? 0 : 7 - (occupiedAfterLeading % 7);

  const slots = [
    ...Array.from({ length: leadingPadding }, () => null),
    ...days,
    ...Array.from({ length: trailingPadding }, () => null),
  ];

  const columns = [];
  for (let index = 0; index < slots.length; index += 7) {
    columns.push(slots.slice(index, index + 7));
  }

  const monthLabelByColumn = {};
  days.forEach((day, dayIndex) => {
    if (dayIndex === 0 || day.date.getDate() === 1) {
      const columnIndex = Math.floor((leadingPadding + dayIndex) / 7);
      if (monthLabelByColumn[columnIndex] === undefined) {
        monthLabelByColumn[columnIndex] = MONTH_FORMATTER.format(day.date);
      }
    }
  });

  return { columns, monthLabelByColumn };
}

function TierButtons({ activeTier, onSelect }) {
  return (
    <div className="tier-actions" role="group" aria-label="Effort tiers">
      {ACTION_TIERS.map((tier) => (
        <button
          key={tier}
          type="button"
          className={`tier-button ${activeTier === tier ? "is-active" : ""}`}
          onClick={() => onSelect(tier)}
        >
          {TIER_LABELS[tier]}
        </button>
      ))}
      <button
        type="button"
        className={`tier-button tier-button-clear ${activeTier === "none" ? "is-active" : ""}`}
        onClick={() => onSelect("none")}
      >
        Clear
      </button>
    </div>
  );
}

function App() {
  const [settings, setSettings] = useState(readStoredSettings);
  const [draftSettings, setDraftSettings] = useState(readStoredSettings);
  const [effortData, setEffortData] = useState(readStoredEffortData);
  const [theme, setTheme] = useState(readStoredTheme);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [popover, setPopover] = useState(null);

  const settingsPanelRef = useRef(null);
  const popoverRef = useRef(null);
  const heatmapScrollRef = useRef(null);

  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const todayDate = useMemo(() => parseDateKey(todayKey), [todayKey]);

  const todayTier = effortData[todayKey] ?? "none";

  const heatmapModel = useMemo(() => {
    return buildHeatmapModel(settings.startDate, settings.endDate);
  }, [settings.startDate, settings.endDate]);

  useEffect(() => {
    setDraftSettings(settings);
  }, [settings]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (heatmapScrollRef.current) {
      heatmapScrollRef.current.scrollLeft = 0;
    }
  }, [settings.startDate, settings.endDate]);

  useEffect(() => {
    if (!settingsOpen) {
      return undefined;
    }

    const handleOutside = (event) => {
      const target = event.target;
      if (settingsPanelRef.current?.contains(target)) {
        return;
      }

      if (
        target instanceof Element &&
        target.closest("[data-settings-toggle='true']")
      ) {
        return;
      }

      setSettingsOpen(false);
      setSettingsError("");
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
        setSettingsError("");
      }
    };

    window.addEventListener("mousedown", handleOutside);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (!popover) {
      return undefined;
    }

    const handleOutside = (event) => {
      const target = event.target;
      const clickedPopover = popoverRef.current?.contains(target);
      const clickedCell =
        target instanceof Element && target.closest("[data-day-cell='true']");

      if (!clickedPopover && !clickedCell) {
        setPopover(null);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setPopover(null);
      }
    };

    const closeOnViewportChange = () => {
      setPopover(null);
    };

    window.addEventListener("mousedown", handleOutside);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", closeOnViewportChange, true);
    window.addEventListener("resize", closeOnViewportChange);

    return () => {
      window.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", closeOnViewportChange, true);
      window.removeEventListener("resize", closeOnViewportChange);
    };
  }, [popover]);

  const setTierForDate = (dateKey, tier) => {
    if (!ALL_TIERS.includes(tier)) {
      return;
    }

    setEffortData((previous) => {
      const next = { ...previous };
      if (tier === "none") {
        delete next[dateKey];
      } else {
        next[dateKey] = tier;
      }
      writeEffortData(next);
      return next;
    });
  };

  const openPopoverAtCell = (event, dateKey) => {
    if (dateKey === todayKey) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const left = Math.max(
      20,
      Math.min(rect.left + rect.width / 2, window.innerWidth - 20),
    );
    const top = Math.min(rect.bottom + 10, window.innerHeight - 20);

    setPopover({ dateKey, left, top });
  };

  const handlePopoverTierSelect = (tier) => {
    if (!popover) {
      return;
    }

    setTierForDate(popover.dateKey, tier);
    setPopover(null);
  };

  const saveSettings = () => {
    const { startDate, endDate } = draftSettings;

    if (!isValidDateKey(startDate) || !isValidDateKey(endDate)) {
      setSettingsError("Use valid dates in YYYY-MM-DD format.");
      return;
    }

    if (compareDateKeys(endDate, startDate) <= 0) {
      setSettingsError("End Date must be after Start Date.");
      return;
    }

    const nextSettings = { startDate, endDate };
    setSettings(nextSettings);
    writeSettings(nextSettings);

    setSettingsOpen(false);
    setSettingsError("");
    setPopover(null);
  };

  const resetSettingsToYear = () => {
    const defaults = getDefaultSettings();
    setSettings(defaults);
    setDraftSettings(defaults);
    writeSettings(defaults);

    setSettingsOpen(false);
    setSettingsError("");
    setPopover(null);
  };

  return (
    <main className="app-shell">
      <div className="settings-anchor" ref={settingsPanelRef}>
        <div className="theme-toggle" role="group" aria-label="Theme">
          <button
            type="button"
            data-settings-toggle="true"
            className={`theme-toggle-button ${theme === "dark" ? "is-active" : ""}`}
            aria-pressed={theme === "dark"}
            onClick={() => setTheme("dark")}
          >
            Dark
          </button>
          <button
            type="button"
            data-settings-toggle="true"
            className={`theme-toggle-button ${theme === "light" ? "is-active" : ""}`}
            aria-pressed={theme === "light"}
            onClick={() => setTheme("light")}
          >
            Light
          </button>
        </div>

        <button
          type="button"
          data-settings-toggle="true"
          className="gear-button"
          aria-label="Open settings"
          onClick={() => {
            setSettingsOpen((open) => !open);
            setSettingsError("");
          }}
        >
          ⚙
        </button>

        {settingsOpen && (
          <div className="settings-panel">
            <label className="settings-label">
              Start Date
              <input
                type="date"
                value={draftSettings.startDate}
                onChange={(event) =>
                  setDraftSettings((current) => ({
                    ...current,
                    startDate: event.target.value,
                  }))
                }
              />
            </label>

            <label className="settings-label">
              End Date
              <input
                type="date"
                value={draftSettings.endDate}
                onChange={(event) =>
                  setDraftSettings((current) => ({
                    ...current,
                    endDate: event.target.value,
                  }))
                }
              />
            </label>

            <div className="settings-actions">
              <button
                type="button"
                className="settings-button"
                onClick={saveSettings}
              >
                Save
              </button>
              <button
                type="button"
                className="settings-button settings-button-secondary"
                onClick={resetSettingsToYear}
              >
                Reset to This Year
              </button>
            </div>

            {settingsError ? (
              <p className="settings-error">{settingsError}</p>
            ) : null}
          </div>
        )}
      </div>

      <section className="today-panel">
        <p className="today-label">
          Today - {TODAY_FORMATTER.format(todayDate)}
        </p>
        <TierButtons
          activeTier={todayTier}
          onSelect={(tier) => setTierForDate(todayKey, tier)}
        />
      </section>

      <section className="heatmap-section" aria-label="Effort heatmap">
        <div className="heatmap-scroll" ref={heatmapScrollRef}>
          <div className="heatmap-layout">
            <div className="month-row">
              <span className="axis-spacer" aria-hidden="true" />
              <div
                className="month-grid"
                style={{
                  gridTemplateColumns: `repeat(${heatmapModel.columns.length}, var(--cell-size))`,
                }}
              >
                {heatmapModel.columns.map((_, columnIndex) => (
                  <span className="month-label" key={`month-${columnIndex}`}>
                    {heatmapModel.monthLabelByColumn[columnIndex] ?? ""}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid-row">
              <div className="day-axis">
                {DAY_AXIS_LABELS.map((label, rowIndex) => (
                  <span key={`axis-${rowIndex}`} className="day-axis-label">
                    {label}
                  </span>
                ))}
              </div>

              <div
                className="weeks-grid"
                style={{
                  gridTemplateColumns: `repeat(${heatmapModel.columns.length}, var(--cell-size))`,
                }}
              >
                {heatmapModel.columns.map((column, columnIndex) => (
                  <div className="week-column" key={`column-${columnIndex}`}>
                    {column.map((slot, rowIndex) => {
                      if (!slot) {
                        return (
                          <span
                            className="heatmap-cell cell-empty"
                            key={`empty-${columnIndex}-${rowIndex}`}
                            aria-hidden="true"
                          />
                        );
                      }

                      const tier = effortData[slot.key] ?? "none";
                      const isToday = slot.key === todayKey;

                      return (
                        <button
                          key={slot.key}
                          type="button"
                          data-day-cell="true"
                          className={`heatmap-cell tier-${tier} ${isToday ? "is-today" : ""}`}
                          aria-label={`${DATE_READABLE_FORMATTER.format(slot.date)}: ${TIER_LABELS[tier]}`}
                          onClick={(event) =>
                            openPopoverAtCell(event, slot.key)
                          }
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {popover && (
        <div
          className="day-popover"
          ref={popoverRef}
          style={{ top: `${popover.top}px`, left: `${popover.left}px` }}
        >
          <p className="popover-date">
            {DATE_READABLE_FORMATTER.format(parseDateKey(popover.dateKey))}
          </p>
          <TierButtons
            activeTier={effortData[popover.dateKey] ?? "none"}
            onSelect={handlePopoverTierSelect}
          />
        </div>
      )}
    </main>
  );
}

export default App;
