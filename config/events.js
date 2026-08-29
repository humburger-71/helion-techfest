"use strict";

// This catalogue is shared by the public API and server-side validation.
// Add future HELION events or tracks here; the interest form updates automatically.
const TRACKS = Object.freeze([
  Object.freeze({
    value: "general-interest",
    label: "HELION 2027 — General Interest",
    active: true
  })
]);

function getPublicTracks() {
  return TRACKS
    .filter((track) => track.active)
    .map(({ value, label }) => ({ value, label }));
}

module.exports = { TRACKS, getPublicTracks };
