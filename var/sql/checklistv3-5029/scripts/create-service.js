const fs = require("fs");
const path = require("path");

const entity = process.argv[2];

if (!entity) {
  console.error("❌ Usage: npm run generate:service -- <entity>");
  process.exit(1);
}

// Converts kebab-case or snake_case to camelCase
const toCamelCase = (str) =>
  str.replace(/[-_](.)/g, (_, char) => char.toUpperCase());

// Converts kebab-case or snake_case to PascalCase
const toPascalCase = (str) => {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
};

// Extract prefix for model variable (first segment only)
const getPrefix = (str) => str.split(/[-_]/)[0];

const camelModel = toCamelCase(getPrefix(entity));
const pascalEntity = toPascalCase(entity);

const folderPath = path.join("domain", entity.toLowerCase());
const fileName = `${entity.toLowerCase()}.service.js`;
const filePath = path.join(folderPath, fileName);

const content = `const ${camelModel}Model = require("./${entity.toLowerCase()}.model");

class ${pascalEntity}Service {
  static async index(data) {
    return data;
  }
}

module.exports = new ${pascalEntity}Service();
`;

if (!fs.existsSync(folderPath)) {
  fs.mkdirSync(folderPath, { recursive: true });
}

if (fs.existsSync(filePath)) {
  console.warn(`⚠️  File already exists: ${filePath}. Skipping.`);
  process.exit(0);
}

fs.writeFileSync(filePath, content);
console.log(`✅ Service file created: ${filePath}`);
