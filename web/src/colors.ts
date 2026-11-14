// Chart colours from the Okabe-Ito palette (distinguishable with the common forms of colour
// blindness). Every chart also tells the series apart by marker shape or dash, so no
// information depends on colour alone.

export const ORBIT_COLORS = { asc: "#0072B2", desc: "#E69F00" } as const; // blue, orange
export const COHERENCE_COLOR = "#009E73"; // bluish green
export const HARVEST_COLOR = "#CC79A7"; // reddish purple: harvest line and ± band
export const FIRE_COLOR = "#D55E00"; // vermillion: fire markers on the x axis
export const REFERENCE_COLOR = "#6a737d"; // grey: reference lines
export const GRID_COLOR = "#e4e6ea";
export const OFFICIAL_COLOR = "#0072B2"; // blue: official mill share (season progress)
export const MARKER_COLOR = "#1f2328"; // ink: the time slider's week on the season charts
