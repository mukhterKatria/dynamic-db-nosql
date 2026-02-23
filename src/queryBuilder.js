const SUPPORTED_OPERATORS = {
  eq: (value) => value,
  ne: (value) => ({ $ne: value }),
  gt: (value) => ({ $gt: value }),
  gte: (value) => ({ $gte: value }),
  lt: (value) => ({ $lt: value }),
  lte: (value) => ({ $lte: value }),
  in: (value) => ({ $in: Array.isArray(value) ? value : [value] }),
  nin: (value) => ({ $nin: Array.isArray(value) ? value : [value] }),
  regex: (value) => ({ $regex: value, $options: 'i' }),
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

function buildFilter(filters = []) {
  const mongoFilter = {};

  for (const filter of filters) {
    const field = sanitizeField(filter.field);
    const op = filter.op || 'eq';

    if (!SUPPORTED_OPERATORS[op]) {
      throw new Error(`Unsupported operator: ${op}`);
    }

    const normalizedValue = Array.isArray(filter.value)
      ? filter.value.map(parseScalar)
      : parseScalar(filter.value);

    const condition = SUPPORTED_OPERATORS[op](normalizedValue);

    if (op === 'eq') {
      mongoFilter[field] = condition;
    } else {
      mongoFilter[field] = {
        ...(mongoFilter[field] || {}),
        ...condition
      };
    }
  }

  return mongoFilter;
}

function buildProjection(fields = []) {
  if (!Array.isArray(fields) || fields.length === 0) return undefined;

  return fields.reduce((acc, field) => {
    acc[sanitizeField(field)] = 1;
    return acc;
  }, {});
}

function buildSort(sortRules = []) {
  if (!Array.isArray(sortRules) || sortRules.length === 0) return undefined;

  return sortRules.reduce((acc, rule) => {
    const direction = String(rule.dir || 'asc').toLowerCase() === 'desc' ? -1 : 1;
    acc[sanitizeField(rule.field)] = direction;
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
  SUPPORTED_OPERATORS: Object.keys(SUPPORTED_OPERATORS)
};
