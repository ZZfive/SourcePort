import { Ajv, type AnySchema, type ErrorObject, type ValidateFunction } from "ajv";

import type {
  RequestValidationResult,
  SourceFailure,
  SourceRequest,
  ValidationIssue,
  ValidationResult,
} from "./contracts.js";
import { sourceRequestSchema } from "./schemas.js";

const ajv = new Ajv({ allErrors: true, strict: true });
const validateEnvelope = ajv.compile(sourceRequestSchema);
const operationValidatorCache = new WeakMap<object, ValidateFunction>();
const outputValidatorCache = new WeakMap<object, ValidateFunction>();

function pointerToPath(pointer: string): string {
  return pointer
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"))
    .join(".");
}

function errorPath(error: ErrorObject, prefix = ""): string {
  const base = pointerToPath(error.instancePath);
  const property =
    error.keyword === "additionalProperties"
      ? String(error.params["additionalProperty"] ?? "")
      : error.keyword === "required"
        ? String(error.params["missingProperty"] ?? "")
        : "";
  return [prefix, base, property].filter(Boolean).join(".");
}

function envelopeIssues(errors: ErrorObject[] | null | undefined): ValidationIssue[] {
  return (errors ?? []).map((error) => ({
    path: errorPath(error),
    message: error.message ?? "invalid request",
  }));
}

function operationIssues(errors: ErrorObject[] | null | undefined): ValidationIssue[] {
  return (errors ?? []).map((error) => ({
    path: errorPath(error, "parameters"),
    message:
      error.keyword === "additionalProperties"
        ? "unsupported operation parameter"
        : (error.message ?? "invalid operation parameter"),
  }));
}

function validationFailure(code: SourceFailure["code"], message: string): SourceFailure {
  return {
    code,
    message,
    stage: "validation",
    retryable: false,
  };
}

function compileOperationSchema(schema: AnySchema): ValidateFunction {
  if (typeof schema === "boolean") {
    return ajv.compile(schema);
  }
  const cached = operationValidatorCache.get(schema);
  if (cached) {
    return cached;
  }
  const validator = ajv.compile(schema);
  operationValidatorCache.set(schema, validator);
  return validator;
}

function compileOutputSchema(schema: AnySchema): ValidateFunction {
  if (typeof schema === "boolean") {
    return ajv.compile(schema);
  }
  const cached = outputValidatorCache.get(schema);
  if (cached) {
    return cached;
  }
  const validator = ajv.compile(schema);
  outputValidatorCache.set(schema, validator);
  return validator;
}

export function validateSourceRequest(
  input: unknown,
  operationParametersSchema: AnySchema,
): RequestValidationResult {
  if (!validateEnvelope(input)) {
    return {
      ok: false,
      failure: validationFailure("invalid_request", "invalid SourceRequest envelope"),
      issues: envelopeIssues(validateEnvelope.errors),
    };
  }

  const request = input as SourceRequest;
  const validateParameters = compileOperationSchema(operationParametersSchema);
  if (!validateParameters(request.parameters)) {
    const errors = validateParameters.errors ?? [];
    const hasUnsupportedParameter = errors.some((error) => error.keyword === "additionalProperties");
    return {
      ok: false,
      failure: validationFailure(
        hasUnsupportedParameter ? "unsupported_parameter" : "invalid_request",
        hasUnsupportedParameter ? "unsupported operation parameter" : "invalid operation parameters",
      ),
      issues: operationIssues(errors),
    };
  }

  return { ok: true, value: request };
}

export function validateOperationOutput(
  input: unknown,
  outputSchema: AnySchema,
): ValidationResult<unknown> {
  const validateOutput = compileOutputSchema(outputSchema);
  if (validateOutput(input)) {
    return { ok: true, value: input };
  }
  return {
    ok: false,
    issues: (validateOutput.errors ?? []).map((error) => ({
      path: errorPath(error, "data"),
      message: error.message ?? "invalid operation output",
    })),
  };
}
