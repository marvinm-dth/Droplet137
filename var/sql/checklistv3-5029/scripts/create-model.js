const fs = require("fs");
const path = require("path");

const entity = process.argv[2];

if (!entity) {
  console.error("❌ Usage: npm run generate:model -- <entity>");
  process.exit(1);
}

// Converts kebab-case or snake_case to PascalCase
const toPascalCase = (str) =>
  str
    .replace(/[-_]/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

// Converts kebab/snake-case to pluralized snake_case
const toSnakeCasePlural = (str) => {
  const snake = str.replace(/-/g, "_").toLowerCase();
  return snake.endsWith("s") ? `${snake}es` : `${snake}s`;
};

const pascalEntity = toPascalCase(entity);
const pluralTableName = `dev_${toSnakeCasePlural(entity)}`;

const fileName = `${entity.toLowerCase()}.model.js`;
const folderPath = path.join("domain", entity.toLowerCase());
const filePath = path.join(folderPath, fileName);

// Create folder if it doesn't exist
if (!fs.existsSync(folderPath)) {
  fs.mkdirSync(folderPath, { recursive: true });
}

// Exit if file already exists
if (fs.existsSync(filePath)) {
  console.warn(`⚠️  File already exists: ${filePath}. Skipping.`);
  process.exit(0);
}

const content = `const BaseModel = require("../../core/base.model");
const supabase = require("../../core/supabase");
const Joi = require("joi");

class ${pascalEntity}Model extends BaseModel {
  table = "${pluralTableName}";
  ascendantTree = [""];
  descendantTree = [""];
  transformations = [];
  insertSchema = Joi.object({
  });
  updateSchema = Joi.object({
  }).min(1);
}

module.exports = new ${pascalEntity}Model();
`;

fs.writeFileSync(filePath, content);
console.log(`✅ Model file created: ${filePath}`);
