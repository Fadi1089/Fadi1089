// Camera stops, one per section with a data-cam attribute. Shared by the camera
// (main.js) and the scenes built at each stop (props.js), so a scene can turn
// its front toward the camera.
//
// target: landmark name, az: degrees around it (0 = camera on the +z side),
// dist: horizontal distance, h: height above target, up: raises the point
// the camera looks at (for scenes that float above the ground),
// mlift: how far the subject rises above the panel on phones (x h),
// ahead: moves the look point toward the camera,
// shift: how far the subject slides right (desktop). Stops with a text panel
// work it out from the panel instead, see stopParams in main.js.
export const STOPS = {
  hero: { target: "center", az: 18, dist: 44, h: 31, shift: 17 },
  about: { target: "south", az: -25, dist: 8.5, h: 4.4, shift: 3.5, up: 0.2, mlift: 1.05 },
  tristik: { target: "village", az: 40, dist: 7.5, h: 5, shift: 3.5, up: 0.2 },
  cvie: { target: "forest", az: 115, dist: 6.5, h: 3.8, shift: 3.5, up: 0.5 },
  formio: { target: "north", az: 190, dist: 6.5, h: 3.6, shift: 3.5, up: 0.25 },
  wfc: { target: "center", az: 200, dist: 0.01, h: 62, shift: 14, top: true },
  adeli: { target: "peak", az: 300, dist: 7.5, h: 4.6, shift: 4, up: 0.2 },
  stack: { target: "rock", az: 250, dist: 6.5, h: 3.8, shift: 4, up: 0.6 },
  contact: { target: "west", az: 285, dist: 7.5, h: 4.4, shift: 3.5, up: 0, ahead: 1.3, mlift: 0.6 },
};
