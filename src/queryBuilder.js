const SUPPORTED_OPERATORS = {
  eq: (value) => value,
  ne: (value) => ({ $ne: value }),
  gt: (value) => ({ $gt: value }),
  gte: (value) => ({ $gte: value }),
  lt: (value) => ({ $lt: value }),
  lte: (value) => ({ $lte: value }),
  in: (value) => ({ $in: Array.isArray(value) ? value : [value] }),
  nin: (value) => ({ $nin: Array.isArray(value) ? value : [value] }),
  regex: (value) => ({ $regex: String(value), $options: 'i' }),
  exists: (value) => ({ $exists: Boolean(value) })
};

const DANGEROUS_FIELD_PATTERN = /\$|\x00/;

function parseScalar(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '') return value;
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true';
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(trimmed)) {
    const date = new Date(trimmed);
    if (!Number.isNaN(date.valueOf())) return date;
  }
  return value;
}

function parseFilterValue(op, rawValue) {
  if (op === 'in' || op === 'nin') {
    if (Array.isArray(rawValue)) return rawValue.map(parseScalar);
    return String(rawValue)
      .split(',')
      .map((v) => parseScalar(v.trim()))
      .filter((v) => v !== '');
  }
  return parseScalar(rawValue);
}

function sanitizeField(field) {
  if (typeof field !== 'string' || !field.trim()) {
    throw new Error('Field name is required.');
  }
  const cleaned = field.trim();
  if (DANGEROUS_FIELD_PATTERN.test(cleaned)) {
    throw new Error(`Invalid field name: ${field}`);
  }
  return cleaned;
}

function assertFieldsAllowed(fields, allowedFields = []) {
  if (!Array.isArray(allowedFields) || allowedFields.length === 0) return;
  const allowed = new Set(allowedFields);
  fields.forEach((field) => {
    if (!allowed.has(field)) {
      throw new Error(`Unknown field requested: ${field}`);
    }
  });
}

function buildFilter(filters = [], options = {}) {
  const mongoFilter = {};
  const normalizedFields = [];

  for (const filter of filters) {
    const field = sanitizeField(filter.field);
    const op = filter.op || 'eq';

    if (!SUPPORTED_OPERATORS[op]) {
      throw new Error(`Unsupported operator: ${op}`);
    }

    normalizedFields.push(field);
    const normalizedValue = parseFilterValue(op, filter.value);
    const condition = SUPPORTED_OPERATORS[op](normalizedValue);

    const existing = mongoFilter[field];

    // If there is no existing condition for this field, keep current behavior:
    // store scalars for simple equality, operator-objects for others.
    if (existing === undefined) {
      if (op === 'eq') {
        mongoFilter[field] = condition;
      } else {
        mongoFilter[field] = condition;
      }
      continue;
    }

    // There is already a condition for this field; normalize any scalar
    // (from a previous 'eq') to an operator-object so we can safely merge.
    let existingCondition;
    if (existing !== null && typeof existing === 'object' && !Array.isArray(existing)) {
      existingCondition = existing;
    } else {
      existingCondition = { $eq: existing };
    }

    if (op === 'eq') {
      // Represent equality explicitly when combining with other operators.
      mongoFilter[field] = {
        ...existingCondition,
        $eq: normalizedValue
      };
    } else {
      mongoFilter[field] = {
        ...existingCondition,
        ...condition
      };
    }
  }

  assertFieldsAllowed(normalizedFields, options.allowedFields);
  return mongoFilter;
}

function buildProjection(fields = [], options = {}) {
  if (!Array.isArray(fields) || fields.length === 0) return undefined;
  const normalized = fields.map(sanitizeField);
  assertFieldsAllowed(normalized, options.allowedFields);

  return normalized.reduce((acc, field) => {
    acc[field] = 1;
    return acc;
  }, {});
}

function buildSort(sortRules = [], options = {}) {
  if (!Array.isArray(sortRules) || sortRules.length === 0) return undefined;

  const normalized = sortRules.map((rule) => {
    const field = sanitizeField(rule.field);
    return {
      field,
      direction: String(rule.dir || 'asc').toLowerCase() === 'desc' ? -1 : 1
    };
  });

  assertFieldsAllowed(normalized.map((item) => item.field), options.allowedFields);

  return normalized.reduce((acc, item) => {
    acc[item.field] = item.direction;
    return acc;
  }, {});
}

function normalizeLimit(limit, defaultLimit = 50, maxLimit = 500) {
  const parsed = Number(limit || defaultLimit);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultLimit;
  return Math.min(Math.trunc(parsed), maxLimit);
}

module.exports = {
  buildFilter,
  buildProjection,
  buildSort,
  normalizeLimit,
  parseScalar,
  sanitizeField,
  parseFilterValue,
  assertFieldsAllowed,
  SUPPORTED_OPERATORS: Object.keys(SUPPORTED_OPERATORS)
};
