// Line pictograms for the 3D scenes, drawn on a 2D canvas. Most are SVG path
// data on a 24-unit grid (the same style as the header icons); a few need
// ellipses or text and are drawn in code.

const PATHS = {
  // Stack scene
  terminal: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM7 10l3 2.5L7 15M12.5 15h4.5",
  c: "M17 8.2A6.5 6.5 0 1 0 17 15.8",
  branch: "M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM20 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM6 8v8M18 9c0 4.5-6 3.5-11.5 7",
  hexagon: "M12 2.5 20.5 7.3v9.4L12 21.5l-8.5-4.8V7.3zM12 8v8M8.5 10l7 4M15.5 10l-7 4",
  database: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  prism: "M12 2.5 4 18l8 3.5 8-3.5zM12 2.5v19",
  browser: "M3 5h18v14H3zM3 9h18M6 7h.01M8.5 7h.01M11 7h.01",
  cube: "M12 2.5 20.5 7v10L12 21.5 3.5 17V7zM12 12l8.5-5M12 12 3.5 7M12 12v9.5",
  gamepad: "M7 8h10a4 4 0 0 1 3.9 4.9l-.9 4a2.5 2.5 0 0 1-4.3 1L14 16h-4l-1.7 1.9a2.5 2.5 0 0 1-4.3-1l-.9-4A4 4 0 0 1 7 8zM8 10.5v3.5M6.25 12.25h3.5M15.5 11.5h.01M17.5 13.5h.01",
  // Léa Learn catalogue: course topics
  sheet: "M4 4h16v16H4zM4 9h16M4 14.5h16M10 4v16",
  people: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16.5 11a2.5 2.5 0 1 0 0-5M17.5 14c2 .6 3.5 2.6 3.5 5",
  chat: "M4 5h16v11H9.5L4 20z M8 9.5h8M8 12.5h5",
  shield: "M12 3 20 6v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-5",
  euro: "M17.5 6.5a7 7 0 1 0 0 11M4 10.3h9.5M4 13.7h9.5",
  chart: "M4 20h16M7 20v-6M12 20V8M17 20v-10",
  bolt: "M13 2 4.5 14h7l-1 8L19 10h-7z",
  laptop: "M5 5h14v10H5zM2.5 19h19l-2-4h-15z",
  aid: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6z",
  megaphone: "M3 10v4h3l7 5V5L6 10zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11",
  scale: "M12 3v18M7.5 21h9M5 7h14M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z",
  gear: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1",
  check: "M5 12.5 9.5 17 19 7.5",
};

const CUSTOM = {
  atom(g) {
    for (const a of [0, Math.PI / 3, -Math.PI / 3]) {
      g.beginPath();
      g.ellipse(12, 12, 9, 3.6, a, 0, Math.PI * 2);
      g.stroke();
    }
    g.beginPath();
    g.arc(12, 12, 1.4, 0, Math.PI * 2);
    g.fill();
  },
  orbit(g) {
    g.beginPath();
    g.arc(12, 12, 5.5, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.ellipse(12, 12, 10, 3.2, -0.45, 0, Math.PI * 2);
    g.stroke();
  },
  ts(g, font) {
    g.beginPath();
    g.roundRect(3, 3, 18, 18, 2.5);
    g.stroke();
    g.font = `800 9.5px ${font}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("TS", 13.5, 15.5);
  },
};

// Draws icon `name` into a size x size box at (x, y), with the current
// strokeStyle/fillStyle. `weight` is the line width on the 24-unit grid.
export function drawIcon(g, name, x, y, size, weight = 1.9, font = "sans-serif") {
  g.save();
  g.translate(x, y);
  g.scale(size / 24, size / 24);
  g.lineWidth = weight;
  g.lineCap = "round";
  g.lineJoin = "round";
  if (CUSTOM[name]) CUSTOM[name](g, font);
  else g.stroke(new Path2D(PATHS[name]));
  g.restore();
}
