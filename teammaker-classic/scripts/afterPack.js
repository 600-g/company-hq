const { cpSync, existsSync } = require("fs");
const path = require("path");

exports.default = async function (context) {
  const standaloneModules = path.join(process.cwd(), "dist-standalone", "node_modules");
  if (!existsSync(standaloneModules)) return;

  const isWin = context.electronPlatformName === "win32";
  const resourcesDir = isWin
    ? path.join(context.appOutDir, "resources")
    : path.join(
        context.appOutDir,
        `${context.packager.appInfo.productFilename}.app`,
        "Contents",
        "Resources"
      );

  const dest = path.join(resourcesDir, "standalone", "node_modules");
  cpSync(standaloneModules, dest, { recursive: true });
  console.log(`  • copied standalone node_modules to ${dest}`);
};
