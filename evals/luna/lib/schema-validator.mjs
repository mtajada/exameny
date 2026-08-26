export function validateSchema(value, schema, path = "$", errors = []) {
  if (schema.type === "object") {
    if (!isPlainObject(value)) {
      errors.push(`${path} must be an object`);
      return errors;
    }
    const propertyNames = Object.keys(schema.properties ?? {});
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) {
        errors.push(`${path}.${required} is required`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const actual of Object.keys(value)) {
        if (!propertyNames.includes(actual)) {
          errors.push(`${path}.${actual} is not allowed`);
        }
      }
    }
    for (const [name, childSchema] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, name)) {
        validateSchema(value[name], childSchema, `${path}.${name}`, errors);
      }
    }
    return errors;
  }

  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${path} must be an array`);
      return errors;
    }
    checkNumericKeyword(value.length, schema.minItems, (actual, expected) => actual >= expected, `${path} has too few items`, errors);
    checkNumericKeyword(value.length, schema.maxItems, (actual, expected) => actual <= expected, `${path} has too many items`, errors);
    if (schema.uniqueItems) {
      const serialized = value.map((item) => JSON.stringify(item));
      if (new Set(serialized).size !== serialized.length) {
        errors.push(`${path} must contain unique items`);
      }
    }
    value.forEach((item, index) => validateSchema(item, schema.items, `${path}[${index}]`, errors));
    return errors;
  }

  if (schema.type === "string") {
    if (typeof value !== "string") {
      errors.push(`${path} must be a string`);
      return errors;
    }
    checkNumericKeyword(value.length, schema.minLength, (actual, expected) => actual >= expected, `${path} is too short`, errors);
    checkNumericKeyword(value.length, schema.maxLength, (actual, expected) => actual <= expected, `${path} is too long`, errors);
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) {
      errors.push(`${path} has an invalid format`);
    }
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`${path} is not an allowed value`);
    }
    return errors;
  }

  if (schema.type === "integer") {
    if (!Number.isInteger(value)) {
      errors.push(`${path} must be an integer`);
      return errors;
    }
    checkNumericKeyword(value, schema.minimum, (actual, expected) => actual >= expected, `${path} is below minimum`, errors);
    checkNumericKeyword(value, schema.maximum, (actual, expected) => actual <= expected, `${path} is above maximum`, errors);
    return errors;
  }

  if (schema.type === "boolean" && typeof value !== "boolean") {
    errors.push(`${path} must be a boolean`);
  }
  return errors;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function checkNumericKeyword(actual, expected, predicate, message, errors) {
  if (typeof expected === "number" && !predicate(actual, expected)) {
    errors.push(message);
  }
}
