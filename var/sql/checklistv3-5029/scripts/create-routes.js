const fs = require("fs");
const path = require("path");

const entity = process.argv[2];

if (!entity) {
  console.error("❌ Usage: npm run generate:routes -- <entity>");
  process.exit(1);
}

// Converts kebab-case or snake_case to camelCase
const toCamelCase = (str) =>
  str.replace(/[-_](.)/g, (_, char) => char.toUpperCase());

const camelEntity = toCamelCase(entity);
const folderPath = path.join("domain", entity.toLowerCase());
const fileName = `${entity.toLowerCase()}.routes.js`;
const filePath = path.join(folderPath, fileName);

const content = `const express = require("express");
const ${camelEntity}Router = express.Router();
const ${camelEntity}Controller = require("./${entity.toLowerCase()}.controller");

${camelEntity}Router.get("/", ${camelEntity}Controller.index);
${camelEntity}Router.get("/:id", ${camelEntity}Controller.show);
${camelEntity}Router.post("/", ${camelEntity}Controller.create);
${camelEntity}Router.put("/:id", ${camelEntity}Controller.update);
${camelEntity}Router.delete("/:id", ${camelEntity}Controller.delete);

module.exports = ${camelEntity}Router;
`;

if (!fs.existsSync(folderPath)) {
  fs.mkdirSync(folderPath, { recursive: true });
}

if (fs.existsSync(filePath)) {
  console.warn(`⚠️  File already exists: ${filePath}. Skipping.`);
  process.exit(0);
}

fs.writeFileSync(filePath, content);
console.log(`✅ Route file created: ${filePath}`);
