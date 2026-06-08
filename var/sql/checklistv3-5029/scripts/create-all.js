const { execSync } = require("child_process");

const entity = process.argv[2];

if (!entity) {
  console.error("❌ Usage: npm run create:all -- <entity>");
  process.exit(1);
}

try {
  console.log("🔧 Generating model...");
  execSync(`npm run create:model -- ${entity}`, { stdio: "inherit" });

  console.log("🔧 Generating controller...");
  execSync(`npm run create:controller -- ${entity}`, { stdio: "inherit" });

  console.log("🔧 Generating service...");
  execSync(`npm run create:service -- ${entity}`, { stdio: "inherit" });

  console.log("🔧 Generating routes...");
  execSync(`npm run create:routes -- ${entity}`, { stdio: "inherit" });

  console.log("✅ All components generated successfully!");
} catch (err) {
  console.error("❌ Error generating one or more components.");
  process.exit(1);
}
