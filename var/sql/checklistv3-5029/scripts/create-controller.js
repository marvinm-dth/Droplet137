const fs = require("fs");
const path = require("path");

const entity = process.argv[2];

if (!entity) {
  console.error("❌ Usage: npm run generate:controller -- <entity>");
  process.exit(1);
}

// Convert kebab-case or snake_case to camelCase
const toCamelCase = (str) =>
  str.replace(/[-_](.)/g, (_, char) => char.toUpperCase());

// Convert to PascalCase
const toPascalCase = (str) => {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
};

// Get the first part of the entity (e.g., "user" from "user-task")
const getPrefix = (str) => str.split(/[-_]/)[0];

const folderPath = path.join("domain", entity.toLowerCase());
const fileName = `${entity.toLowerCase()}.controller.js`;
const filePath = path.join(folderPath, fileName);

const entityPrefix = getPrefix(entity);
const camelPrefix = toCamelCase(entityPrefix);
const pascalEntity = toPascalCase(entity);
const pluralClassName = pascalEntity.endsWith("s")
  ? `${pascalEntity}es`
  : `${pascalEntity}s`;

const content = `const BaseController = require("../../core/base.controller");
const ${camelPrefix}Model = require("./${entity.toLowerCase()}.model");
const ${camelPrefix}Service = require("./${entity.toLowerCase()}.service");

class ${pluralClassName}Controller extends BaseController {
  model = ${camelPrefix}Model;
  /**
   * index = async (req, res) => {};
   * show = async (req, res) => {};
   * create = async (req, res) => {};
   * update = async (req, res) => {};
   * delete = async (req, res) => {};
  */
}

module.exports = new ${pluralClassName}Controller();
`;

if (!fs.existsSync(folderPath)) {
  fs.mkdirSync(folderPath, { recursive: true });
}

if (fs.existsSync(filePath)) {
  console.warn(`⚠️  File already exists: ${filePath}. Skipping.`);
  process.exit(0);
}

fs.writeFileSync(filePath, content);
console.log(`✅ Controller created at: ${filePath}`);
