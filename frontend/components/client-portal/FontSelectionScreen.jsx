"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Check,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  LayoutList,
  LayoutGrid,
  Type,
  X,
} from "lucide-react";
import { clientPortalService } from "../../services/clientPortalService";
import "./FontSelectionScreen.css";

export const GOOGLE_FONTS_CATALOG = [
  // --- Sans-Serif ---
  { name: "Inter", category: "Sans-Serif", styles: "9 styles", designer: "Rasmus Andersson" },
  { name: "Roboto", category: "Sans-Serif", styles: "12 styles", designer: "Christian Robertson" },
  { name: "Montserrat", category: "Sans-Serif", styles: "18 styles", designer: "Julieta Ulanovsky" },
  { name: "Poppins", category: "Sans-Serif", styles: "18 styles", designer: "Indian Type Foundry" },
  { name: "Plus Jakarta Sans", category: "Sans-Serif", styles: "16 styles", designer: "Tokotype" },
  { name: "Open Sans", category: "Sans-Serif", styles: "10 styles", designer: "Steve Matteson" },
  { name: "Lato", category: "Sans-Serif", styles: "10 styles", designer: "Łukasz Dziedzic" },
  { name: "Raleway", category: "Sans-Serif", styles: "18 styles", designer: "Matt McInerney" },
  { name: "Work Sans", category: "Sans-Serif", styles: "18 styles", designer: "Wei Huang" },
  { name: "DM Sans", category: "Sans-Serif", styles: "14 styles", designer: "Colophon Foundry" },
  { name: "Manrope", category: "Sans-Serif", styles: "7 styles", designer: "Mikhail Sharanda" },
  { name: "Space Grotesk", category: "Sans-Serif", styles: "5 styles", designer: "Florian Karsten" },
  { name: "Syne", category: "Sans-Serif", styles: "5 styles", designer: "Bonjour Monde" },
  { name: "Outfit", category: "Sans-Serif", styles: "9 styles", designer: "Outfit Studio" },
  { name: "Urbanist", category: "Sans-Serif", styles: "18 styles", designer: "Corey Hu" },
  { name: "Oswald", category: "Sans-Serif", styles: "7 styles", designer: "Vernon Adams" },
  { name: "Rubik", category: "Sans-Serif", styles: "10 styles", designer: "Hubert & Fischer" },
  { name: "Nunito", category: "Sans-Serif", styles: "14 styles", designer: "Vernon Adams" },

  // --- Serif ---
  { name: "Playfair Display", category: "Serif", styles: "6 styles", designer: "Claus Eggers Sørensen" },
  { name: "Merriweather", category: "Serif", styles: "8 styles", designer: "Sorkin Type" },
  { name: "Lora", category: "Serif", styles: "8 styles", designer: "Cyreal" },
  { name: "Cormorant Garamond", category: "Serif", styles: "10 styles", designer: "Christian Thalmann" },
  { name: "Cinzel", category: "Serif", styles: "6 styles", designer: "Natanael Gama" },
  { name: "Bodoni Moda", category: "Serif", styles: "16 styles", designer: "Owen Earl" },
  { name: "EB Garamond", category: "Serif", styles: "10 styles", designer: "Georg Duffner" },
  { name: "DM Serif Display", category: "Serif", styles: "2 styles", designer: "Colophon Foundry" },
  { name: "Libre Baskerville", category: "Serif", styles: "3 styles", designer: "Impallari Type" },
  { name: "Prata", category: "Serif", styles: "1 style", designer: "Cyreal" },
  { name: "Spectral", category: "Serif", styles: "14 styles", designer: "Production Type" },
  { name: "Bitter", category: "Serif", styles: "16 styles", designer: "Sol Matas" },

  // --- Display ---
  { name: "Bebas Neue", category: "Display", styles: "1 style", designer: "Ryoichi Tsunekawa" },
  { name: "Righteous", category: "Display", styles: "1 style", designer: "Astigmatic" },
  { name: "Abril Fatface", category: "Display", styles: "1 style", designer: "TypeTogether" },
  { name: "Unbounded", category: "Display", styles: "6 styles", designer: "Studio Koto" },
  { name: "Cinzel Decorative", category: "Display", styles: "3 styles", designer: "Natanael Gama" },
  { name: "Staatliches", category: "Display", styles: "1 style", designer: "Brian Zick" },
  { name: "Anton", category: "Display", styles: "1 style", designer: "Vernon Adams" },
  { name: "Alfa Slab One", category: "Display", styles: "1 style", designer: "JM Solé" },
  { name: "Yeseva One", category: "Display", styles: "1 style", designer: "Jovanny Lemonad" },

  // --- Monospace ---
  { name: "Space Mono", category: "Monospace", styles: "4 styles", designer: "Colophon Foundry" },
  { name: "Fira Code", category: "Monospace", styles: "6 styles", designer: "Nikita Prokopov" },
  { name: "JetBrains Mono", category: "Monospace", styles: "16 styles", designer: "JetBrains" },
  { name: "Roboto Mono", category: "Monospace", styles: "10 styles", designer: "Christian Robertson" },
  { name: "Inconsolata", category: "Monospace", styles: "9 styles", designer: "Raph Levien" },
  { name: "Source Code Pro", category: "Monospace", styles: "14 styles", designer: "Paul D. Hunt" },

  // --- Handwriting / Script ---
  { name: "Dancing Script", category: "Handwriting", styles: "4 styles", designer: "Impallari Type" },
  { name: "Pacifico", category: "Handwriting", styles: "1 style", designer: "Vernon Adams" },
  { name: "Great Vibes", category: "Handwriting", styles: "1 style", designer: "TypeSETit" },
  { name: "Caveat", category: "Handwriting", styles: "4 styles", designer: "Impallari Type" },
  { name: "Alex Brush", category: "Handwriting", styles: "1 style", designer: "TypeSETit" },
  { name: "Sacramento", category: "Handwriting", styles: "1 style", designer: "Astigmatic" },
];

const CATEGORIES = ["All", "Sans-Serif", "Serif", "Display", "Monospace", "Handwriting"];

function getFontFallback(category) {
  if (category === "Serif") return "serif";
  if (category === "Monospace") return "monospace";
  if (category === "Handwriting") return "cursive";
  return "sans-serif";
}

export function FontSelectionScreen({
  project = {},
  clientData = {},
  token = "",
  onNext = () => {},
  onProjectRefresh = () => {},
}) {
  const projectId = project?.id || project?._id || project?.project_id || "";
  const companyName = clientData?.company_name || clientData?.clientCompany || project?.company_name || project?.name || "";

  // Single selected brand font
  const [selectedFont, setSelectedFont] = useState("Plus Jakarta Sans");

  // Filtering, Search & Layout View
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("row"); // "row" or "grid"
  const [specimenFontSize, setSpecimenFontSize] = useState(36); // px

  // Live preview text (like Google Fonts sentence preview)
  const defaultSample = companyName
    ? `${companyName} • Signature Identity`
    : "Everyone has the right to freedom of thought, conscience and religion";
  const [previewText, setPreviewText] = useState(defaultSample);
  const [isSaving, setIsSaving] = useState(false);

  // Sync previewText with companyName if updated
  useEffect(() => {
    if (companyName && (!previewText || previewText === "Everyone has the right to freedom of thought, conscience and religion")) {
      setPreviewText(`${companyName} • Signature Identity`);
    }
  }, [companyName, previewText]);

  // Load stored preferences
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const stored = clientPortalService.getClientFontPreferences(projectId || token);
      if (stored?.selectedFont) {
        setSelectedFont(stored.selectedFont);
      } else if (stored?.headlineFont) {
        setSelectedFont(stored.headlineFont);
      } else if (stored?.bodyFont) {
        setSelectedFont(stored.bodyFont);
      }
      if (stored?.previewSample) {
        setPreviewText(stored.previewSample);
      }
    } catch {}
  }, [projectId, token]);

  // Dynamically load Google Fonts into document head
  useEffect(() => {
    if (typeof document === "undefined") return;

    const fontNames = GOOGLE_FONTS_CATALOG.map((f) => f.name);
    const chunkSize = 12;

    for (let i = 0; i < fontNames.length; i += chunkSize) {
      const slice = fontNames.slice(i, i + chunkSize);
      const families = slice
        .map((name) => `family=${name.replace(/ /g, "+")}`)
        .join("&");
      const url = `https://fonts.googleapis.com/css2?${families}&display=swap`;

      const linkId = `gfonts-batch-${i / chunkSize}`;
      if (!document.getElementById(linkId)) {
        const linkEl = document.createElement("link");
        linkEl.id = linkId;
        linkEl.rel = "stylesheet";
        linkEl.href = url;
        document.head.appendChild(linkEl);
      }
    }
  }, []);

  // Ensure selected font is explicitly loaded with weights & triggered in browser font cache
  useEffect(() => {
    if (typeof document === "undefined" || !selectedFont) return;

    const id = `gfont-selected-${selectedFont.replace(/\s+/g, "-").toLowerCase()}`;
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${selectedFont.replace(/\s+/g, "+")}:wght@400;600;700;800&display=swap`;
      document.head.appendChild(link);
    }
    try {
      if (document.fonts && document.fonts.load) {
        document.fonts.load(`1em "${selectedFont}"`);
        document.fonts.load(`bold 1em "${selectedFont}"`);
      }
    } catch {}
  }, [selectedFont]);

  // Filter fonts based on category and search query
  const filteredFonts = useMemo(() => {
    return GOOGLE_FONTS_CATALOG.filter((font) => {
      const matchesCategory =
        activeCategory === "All" || font.category === activeCategory;
      const matchesSearch =
        !searchQuery.trim() ||
        font.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        font.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        font.designer.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, searchQuery]);

  // Save and continue to discovery
  const handleProceedToDiscovery = async () => {
    setIsSaving(true);

    const fontPreferences = {
      selectedFont,
      headlineFont: selectedFont,
      bodyFont: selectedFont,
      selectedAt: new Date().toISOString(),
      previewSample: previewText,
    };

    try {
      clientPortalService.saveClientFontPreferences(projectId || token, fontPreferences);
      await onProjectRefresh();
    } catch (e) {
      console.warn("Could not save font preferences to server, cached locally:", e);
    } finally {
      setIsSaving(false);
      onNext("discovery");
    }
  };

  const handleBackToProfile = () => {
    onNext("profile");
  };

  const handleResetPreview = () => {
    setPreviewText(defaultSample);
    setSpecimenFontSize(36);
    setActiveCategory("All");
    setSearchQuery("");
  };

  return (
    <div className="gf-white-screen">
      {/* 1. TOP HEADER BAR (Clean Google Fonts White Header) */}
      <header className="gf-top-header">
        <div className="gf-header-left">
          <div className="gf-brand-logo-wrap">
            <img
              src="/image/FLOXA_log.png"
              alt="FLOXA"
              className="gf-brand-logo-img"
            />
          </div>
          <span className="gf-brand-title">Fonts</span>
        </div>

        {/* Search Pill in Center (like Google Fonts) */}
        <div className="gf-search-pill">
          <Search size={16} className="gf-search-icon" />
          <input
            type="text"
            placeholder="Search fonts"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery ? (
            <button
              type="button"
              className="gf-search-clear-btn"
              onClick={() => setSearchQuery("")}
              title="Clear search"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>

        {/* Right Actions */}
        <div className="gf-header-right">
          <button
            type="button"
            className="gf-header-btn-ghost"
            onClick={handleBackToProfile}
          >
            <ArrowLeft size={14} />
            <span>Profile</span>
          </button>

          <button
            type="button"
            className="gf-header-btn-help"
            onClick={() => window.dispatchEvent(new CustomEvent("floxa:open_client_intro"))}
            title="How It Works"
          >
            How It Works
          </button>
        </div>
      </header>

      {/* 2. MAIN LAYOUT: LEFT SIDEBAR + RIGHT SPECIMEN AREA */}
      <div className="gf-body-layout">
        {/* LEFT SIDEBAR (Preview input, size slider, filters & selected typography) */}
        <aside className="gf-sidebar">
          {/* Preview Section */}
          <div className="gf-sidebar-section">
            <div className="gf-sidebar-section-head">
              <span className="gf-sidebar-label">Preview</span>
              <button
                type="button"
                className="gf-sidebar-reset-btn"
                onClick={handleResetPreview}
                title="Reset all settings"
              >
                <RotateCcw size={12} />
                <span>Reset all</span>
              </button>
            </div>

            {/* Type Something Input Box (Light gray rounded card like Google Fonts) */}
            <div className="gf-preview-input-card">
              <textarea
                rows={3}
                placeholder="Type something..."
                value={previewText}
                onChange={(e) => setPreviewText(e.target.value)}
              />
            </div>

            {/* Font Size Selector with Slider */}
            <div className="gf-size-slider-row">
              <span className="gf-size-val-label">{specimenFontSize}px</span>
              <input
                type="range"
                min="18"
                max="64"
                step="2"
                value={specimenFontSize}
                onChange={(e) => setSpecimenFontSize(Number(e.target.value))}
                title="Adjust specimen font size"
              />
            </div>
          </div>

          {/* Category Filters */}
          <div className="gf-sidebar-section">
            <span className="gf-sidebar-label">Categories</span>
            <div className="gf-category-list">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`gf-category-btn ${activeCategory === cat ? "active" : ""}`}
                  onClick={() => setActiveCategory(cat)}
                >
                  <span>{cat}</span>
                  {activeCategory === cat ? <Check size={13} strokeWidth={2.5} /> : null}
                </button>
              ))}
            </div>
          </div>

          {/* SELECTED BRAND FONT (Updates live as client selects!) */}
          <div className="gf-selected-showcase-box">
            <div className="gf-showcase-box-title">
              <Type size={13} />
              <span>Selected Brand Font</span>
            </div>

            <div className="gf-showcase-item">
              <div className="gf-showcase-item-meta">
                <span className="gf-meta-badge selected-badge">Active Font</span>
                <strong className="gf-meta-font-name">{selectedFont}</strong>
              </div>
              <div
                className="gf-showcase-live-text selected"
                style={{ fontFamily: `"${selectedFont}", sans-serif` }}
              >
                {previewText || "Bold Vision, Timeless Craft"}
              </div>
            </div>
          </div>
        </aside>

        {/* RIGHT MAIN CONTENT AREA (Specimens list like Google Fonts) */}
        <main className="gf-main-content">
          {/* Top Control Bar: Active filters, View Toggle (Row / Grid) */}
          <div className="gf-content-toolbar">
            <div className="gf-toolbar-left">
              <span className="gf-font-counter">
                <strong>{filteredFonts.length}</strong> fonts found
              </span>
              {activeCategory !== "All" ? (
                <span className="gf-active-cat-tag">
                  {activeCategory}
                  <button type="button" onClick={() => setActiveCategory("All")}>
                    <X size={12} />
                  </button>
                </span>
              ) : null}
            </div>

            {/* Row / Grid View Toggle (like Google Fonts) */}
            <div className="gf-view-toggle">
              <button
                type="button"
                className={`gf-view-btn ${viewMode === "row" ? "active" : ""}`}
                onClick={() => setViewMode("row")}
                title="Row view"
              >
                <LayoutList size={14} />
                <span>Row</span>
              </button>
              <button
                type="button"
                className={`gf-view-btn ${viewMode === "grid" ? "active" : ""}`}
                onClick={() => setViewMode("grid")}
                title="Grid view"
              >
                <LayoutGrid size={14} />
                <span>Grid</span>
              </button>
            </div>
          </div>

          {/* Specimens List */}
          <div className={`gf-specimens-container ${viewMode === "grid" ? "is-grid" : "is-row"}`}>
            {filteredFonts.length === 0 ? (
              <div className="gf-no-results">
                <p>No fonts match &ldquo;{searchQuery}&rdquo;</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setActiveCategory("All");
                  }}
                >
                  Clear Filters
                </button>
              </div>
            ) : (
              filteredFonts.map((font) => {
                const isSelected = selectedFont === font.name;

                return (
                  <article
                    key={font.name}
                    className={`gf-font-entry ${isSelected ? "is-selected-active" : ""}`}
                  >
                    {/* Entry Top Meta: Name, Styles count, Designer, and Single Select Button */}
                    <div className="gf-entry-meta">
                      <div className="gf-entry-info">
                        <h3 className="gf-entry-family">{font.name}</h3>
                        <span className="gf-entry-details">
                          {font.styles} | {font.designer} | {font.category}
                        </span>
                      </div>

                      <div className="gf-entry-actions">
                        <button
                          type="button"
                          className={`gf-select-btn ${isSelected ? "selected" : ""}`}
                          onClick={() => setSelectedFont(font.name)}
                          title={isSelected ? "Font is selected" : `Select ${font.name}`}
                        >
                          {isSelected ? (
                            <>
                              <Check size={13} strokeWidth={3} />
                              <span>Selected</span>
                            </>
                          ) : (
                            <span>Select</span>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Giant Specimen Text (Renders typed text live in actual font family!) */}
                    <div
                      className="gf-entry-specimen"
                      style={{
                        fontFamily: `"${font.name}", ${getFontFallback(font.category)}`,
                        fontSize: `${specimenFontSize}px`,
                      }}
                    >
                      {previewText || "Everyone has the right to freedom of thought, conscience and religion"}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </main>
      </div>

      {/* 3. PINNED BOTTOM ACTION TRAY */}
      <footer className="gf-bottom-bar">
        <div className="gf-bottom-inner">
          <div className="gf-bottom-pairing-info">
            <span className="gf-bottom-pairing-label">Chosen Brand Font:</span>
            <div className="gf-bottom-pill selected">
              <span className="pill-dot selected-dot" />
              <strong style={{ fontFamily: `"${selectedFont}", sans-serif` }}>
                {selectedFont}
              </strong>
            </div>
          </div>

          <div className="gf-bottom-actions">
            <button
              type="button"
              className="gf-btn-secondary"
              onClick={handleBackToProfile}
            >
              Back to Profile
            </button>

            <button
              type="button"
              className="gf-btn-primary"
              onClick={handleProceedToDiscovery}
              disabled={isSaving}
            >
              <span>{isSaving ? "Saving..." : "Continue to Discovery"}</span>
              <ArrowRight size={14} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
