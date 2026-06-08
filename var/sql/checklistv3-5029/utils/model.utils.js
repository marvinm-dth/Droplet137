const Joi = require("joi");
const MyError = require("../core/error.builder");
const errorLogger = require("./errorLogger");

const SUPABASE_ERROR_CODE_MAP = {
  23505: "SUPABASE_UNIQUE_VIOLATION",
  23503: "SUPABASE_FOREIGN_KEY_VIOLATION",
  23502: "SUPABASE_NOT_NULL_VIOLATION",
  23514: "SUPABASE_CHECK_VIOLATION",
  22001: "SUPABASE_STRING_DATA_TOO_LONG",
  22003: "SUPABASE_NUMERIC_VALUE_OUT_OF_RANGE",
  "42P01": "SUPABASE_UNDEFINED_TABLE",
  42703: "SUPABASE_UNDEFINED_COLUMN",
  42601: "SUPABASE_SYNTAX_ERROR",
  42501: "SUPABASE_INSUFFICIENT_PRIVILEGE",
  40001: "SUPABASE_SERIALIZATION_FAILURE",
  "28P01": "SUPABASE_INVALID_PASSWORD",
  57014: "SUPABASE_QUERY_CANCELED",
  53100: "SUPABASE_DISK_FULL",
  53200: "SUPABASE_OUT_OF_MEMORY",
  53300: "SUPABASE_TOO_MANY_CONNECTIONS",
  XX000: "SUPABASE_INTERNAL_ERROR",
};

function supabaseErrorHandler(error, status = 500) {
  if (!error || typeof error !== "object") {
    return new MyError({
      message: "Unknown Supabase error",
      statusCode: status,
      errorCode: "UNKNOWN_SUPABASE_ERROR",
      meta: { rawError: error },
    });
  }

  const { message = "Supabase error occurred", details, hint, code } = error;

  return new MyError({
    message,
    statusCode: status,
    errorCode: SUPABASE_ERROR_CODE_MAP[code] || "SUPABASE_UNKNOWN_ERROR",
    meta: {
      ...(details && { details }),
      ...(hint && { hint }),
      ...(code && { pgCode: code }),
    },
  });
}

function modelErrorWrapper(err, fallback = "Unexpected error") {
  if (err instanceof MyError && err.errorCode?.startsWith("SUPABASE"))
    return err;

  if (err instanceof MyError && err.errorCode?.startsWith("JOI")) return err;

  return new MyError({
    message: err.message || fallback,
    statusCode: 500,
    errorCode: "UNEXPECTED_ERROR",
    meta: { originalError: err },
  });
}

// supposedly logger for successful data fetching
function fetchedDataWrapper(label, { data, error, status, count }) {
  console.group(`[Supabase Response] ${label}`);
  console.log("Status:", status);

  if (error) {
    console.error("Error:", error.message, error.details ?? "");
  } else {
    console.log("Data:", data);
    if (Array.isArray(data)) {
      console.log("Record Count:", data.length);
    }
  }

  console.groupEnd();
  return { data, error };
}

function joiValidateData(schema, data) {
  const validationSchema = Array.isArray(data)
    ? Joi.array().items(schema)
    : schema;

  const { value, error } = validationSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    throw new MyError({
      statusCode: 400,
      errorCode: "JOI_VALIDATION_ERROR",
      message: error.details.map((d) => d.message).join(", "),
    });
  }

  return value;
}

async function transformFetchedData({
  transformations = [],
  data,
  includeTransform = [],
  excludeTransform = [],
  disableTransform = false,
}) {
  if (disableTransform) return data;
  if (!data) return data;
  if (Array.isArray(data) && data.length < 1) return data;

  for (const t of transformations) {
    const name = t?.name || (Array.isArray(t) && t[0]?.name);

    // Skip if blacklisted
    if (excludeTransform.includes(name)) continue;

    // Skip if whitelist is non-empty and this transform is not included
    if (includeTransform.length && !includeTransform.includes(name)) continue;

    try {
      if (Array.isArray(t)) {
        await t[0]({ data, ...t[1] });
      } else {
        await t({ data });
      }
    } catch (err) {
      errorLogger({
        action: "Transforming fetched data",
        methodName: name,
        err,
        isCustom: true,
        errorCode: "TRANSFORMATION_ERROR",
      });
      continue;
    }
  }

  return data;
}

module.exports = {
  supabaseErrorHandler,
  transformFetchedData,
  modelErrorWrapper,
  joiValidateData,
};
