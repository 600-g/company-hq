const { cpSync, rmSync, existsSync } = require("fs");
const path = require("path");

const standaloneDir = path.join(process.cwd(), ".next", "standalone");

// Copy static & public into standalone
cpSync(
  path.join(process.cwd(), ".next", "static"),
  path.join(standaloneDir, ".next", "static"),
  { recursive: true }
);
cpSync(
  path.join(process.cwd(), "public"),
  path.join(standaloneDir, "public"),
  { recursive: true }
);

// Remove unnecessary files
const releaseDir = path.join(standaloneDir, "release");
if (existsSync(releaseDir)) rmSync(releaseDir, { recursive: true, force: true });

// Copy to project-local build directory (cross-platform)
const dest = path.join(process.cwd(), "dist-standalone");

if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
cpSync(standaloneDir, dest, { recursive: true });

// Remove nested copies to prevent recursive bloat
const nestedDist = path.join(dest, "dist-standalone");
if (existsSync(nestedDist)) rmSync(nestedDist, { recursive: true, force: true });
const nestedRelease = path.join(dest, "release");
if (existsSync(nestedRelease)) rmSync(nestedRelease, { recursive: true, force: true });
const nestedLanding = path.join(dest, "landing");
if (existsSync(nestedLanding)) rmSync(nestedLanding, { recursive: true, force: true });

console.log(`Standalone prepared at ${dest}`);
