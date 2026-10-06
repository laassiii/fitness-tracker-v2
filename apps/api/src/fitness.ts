import { ApiError, jsonBody } from "./auth";
import { database, owned, type Identity } from "./database";
import type { Env } from "./index";

type Rule = {
  type: "text" | "number" | "uuid" | "date";
  required?: boolean;
  min?: number;
  max?: number;
  integer?: boolean;
  values?: string[];
  nullable?: boolean;
};
const text = (max = 100, required = false): Rule => ({
  type: "text",
  max,
  required,
});
const number = (
  min: number,
  max: number,
  required = false,
  integer = false,
): Rule => ({ type: "number", min, max, required, integer });
const uuid: Rule = { type: "uuid" };
const date: Rule = { type: "date" };
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validate(
  body: Record<string, unknown>,
  rules: Record<string, Rule>,
  patch = false,
): Record<string, unknown> {
  if (!Object.keys(body).length || Object.keys(body).some((k) => !rules[k]))
    throw new ApiError(
      422,
      "validation_error",
      "Missing fields or unexpected field",
    );
  for (const [key, rule] of Object.entries(rules)) {
    const value = body[key];
    if (value === null && rule.nullable) continue;
    if (value === undefined) {
      if (rule.required && !patch)
        throw new ApiError(422, "validation_error", `${key} is required`);
      continue;
    }
    const valid =
      rule.type === "text"
        ? typeof value === "string" &&
          value.length <= (rule.max ?? 100) &&
          (!rule.required || value.trim().length > 0) &&
          (!rule.values || rule.values.includes(value))
        : rule.type === "number"
          ? typeof value === "number" &&
            Number.isFinite(value) &&
            value >= rule.min! &&
            value <= rule.max! &&
            (!rule.integer || Number.isInteger(value))
          : rule.type === "uuid"
            ? typeof value === "string" && uuidPattern.test(value)
            : typeof value === "string" &&
              Number.isFinite(Date.parse(value)) &&
              value.length <= 40;
    if (!valid) throw new ApiError(422, "validation_error", `Invalid ${key}`);
  }
  return body;
}
const planRules = {
  name: text(100, true),
  description: text(2000),
  archived_at: date,
};
const exerciseRules = {
  name: text(100, true),
  muscle_group: text(80),
  equipment: text(80),
  instructions: text(3000),
  archived_at: date,
};
const dayRules = { name: text(100, true), position: number(0, 99, true, true) };
const targetRules = {
  position: number(0, 49, true, true),
  reps: number(1, 1000, false, true),
  weight_kg: number(0, 2000),
  rest_seconds: number(0, 3600, false, true),
};
const setRules = {
  id: uuid,
  position: number(0, 49, true, true),
  reps: number(1, 1000, true, true),
  weight_kg: number(0, 2000, true),
  rpe: number(1, 10),
  set_type: { type: "text", values: ["working", "warmup"] } as Rule,
  notes: text(1000),
};
const metricRules = {
  id: uuid,
  observed_at: date,
  weight_kg: { ...number(1, 500), nullable: true },
  body_fat_percent: { ...number(0, 100), nullable: true },
  waist_cm: { ...number(1, 500), nullable: true },
  chest_cm: { ...number(1, 500), nullable: true },
  notes: text(1000),
};
function pagination(
  url: URL,
  column: string,
): { query: string; limit: number } {
  const limit = Number(url.searchParams.get("limit") ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new ApiError(
      422,
      "validation_error",
      "Limit must be between 1 and 50",
    );
  let query = `order=${column}.desc,id.desc&limit=${limit + 1}`;
  const cursor = url.searchParams.get("cursor");
  if (cursor) {
    let data: { time: string; id: string };
    try {
      data = JSON.parse(atob(cursor));
    } catch {
      throw new ApiError(422, "validation_error", "Invalid cursor");
    }
    if (
      !data ||
      typeof data.id !== "string" ||
      typeof data.time !== "string" ||
      !uuidPattern.test(data.id) ||
      !Number.isFinite(Date.parse(data.time)) ||
      data.time.length > 40
    )
      throw new ApiError(422, "validation_error", "Invalid cursor");
    const time = new Date(data.time).toISOString();
    query += `&or=(${column}.lt.${time},and(${column}.eq.${time},id.lt.${data.id}))`;
  }
  return { query, limit };
}
function page(rows: Record<string, unknown>[], limit: number, column: string) {
  const more = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    next_cursor:
      more && last
        ? btoa(JSON.stringify({ time: last[column], id: last.id }))
        : null,
  };
}
async function sessionWritable(env: Env, user: Identity, id: string) {
  const session = await owned(env, user, "workout_sessions", id);
  if (session.status !== "in_progress")
    throw new ApiError(409, "session_closed", "Workout is already closed");
  return session;
}

export async function fitness(
  request: Request,
  env: Env,
  user: Identity,
): Promise<unknown> {
  const url = new URL(request.url);
  const path = url.pathname.slice("/api/v1".length);
  const method = request.method;
  if (
    [...url.searchParams.keys()].some(
      (key) => !["limit", "cursor", "status"].includes(key),
    )
  )
    throw new ApiError(422, "validation_error", "Unexpected query parameter");
  if (path === "/me/profile") {
    if (method === "GET")
      return owned(env, user, "profiles", user.id, "user_id", "user_id");
    if (method === "PUT") {
      const body = validate(await jsonBody(request), {
        handle: { type: "text", required: true, max: 30 },
        display_name: text(80, true),
        bio: text(500),
      });
      if (!/^[a-z0-9_]{3,30}$/.test(body.handle as string))
        throw new ApiError(
          422,
          "validation_error",
          "Handle must use 3–30 lowercase letters, numbers or underscores",
        );
      return database(
        env,
        user,
        "profiles?on_conflict=user_id",
        "POST",
        { ...body, user_id: user.id },
        "resolution=merge-duplicates,return=representation",
      );
    }
  }
  if (path === "/me/preferences") {
    if (method === "GET")
      return database(env, user, `preferences?user_id=eq.${user.id}`);
    if (method === "PUT") {
      const body = validate(await jsonBody(request), {
        weight_unit: { type: "text", values: ["kg", "lb"] },
        timezone: text(80),
      });
      if (body.timezone) {
        try {
          new Intl.DateTimeFormat("en", { timeZone: body.timezone as string });
        } catch {
          throw new ApiError(422, "validation_error", "Invalid timezone");
        }
      }
      return database(
        env,
        user,
        "preferences?on_conflict=user_id",
        "POST",
        { ...body, user_id: user.id },
        "resolution=merge-duplicates,return=representation",
      );
    }
  }
  if (path === "/me/privacy" && method === "GET")
    return { visibility: "private", sharing_enabled: false };
  if (path === "/exercises" && method === "GET")
    return {
      system: await database(env, user, "exercises?order=name&limit=200"),
      custom: await database(
        env,
        user,
        `user_exercises?owner_id=eq.${user.id}&archived_at=is.null&order=name&limit=200`,
      ),
    };
  if (path === "/templates" && method === "GET")
    return {
      items: await database(
        env,
        user,
        "workout_templates?select=*,template_exercises(*,template_set_targets(*))&limit=50",
      ),
    };
  if (path === "/custom-exercises" && method === "POST")
    return database(env, user, "user_exercises", "POST", {
      ...validate(await jsonBody(request), exerciseRules),
      owner_id: user.id,
    });
  if (path === "/plans" && method === "POST")
    return database(env, user, "workout_plans", "POST", {
      ...validate(await jsonBody(request), planRules),
      owner_id: user.id,
    });
  if (path === "/plans/from-template" && method === "POST") {
    const body = validate(await jsonBody(request), {
      template_id: { ...uuid, required: true },
      name: text(100, true),
      idempotency_key: { ...uuid, required: true },
    });
    return {
      id: await database(env, user, "rpc/create_plan_from_template", "POST", {
        p_template_id: body.template_id,
        p_name: body.name,
        p_key: body.idempotency_key,
      }),
    };
  }
  if (
    ["/plans", "/sessions", "/history", "/body-metrics"].includes(path) &&
    method === "GET"
  ) {
    const table =
      path === "/plans"
        ? "workout_plans"
        : path === "/body-metrics"
          ? "body_metric_entries"
          : "workout_sessions";
    const column =
      path === "/body-metrics"
        ? "observed_at"
        : path === "/plans"
          ? "created_at"
          : "started_at";
    const { query, limit } = pagination(url, column);
    let filters = "";
    if (path === "/history") filters = "&status=eq.completed";
    else if (path === "/sessions" && url.searchParams.has("status")) {
      const status = url.searchParams.get("status");
      if (!["in_progress", "completed", "discarded"].includes(status!))
        throw new ApiError(422, "validation_error", "Invalid status");
      filters = `&status=eq.${status}`;
    }
    return page(
      (await database(
        env,
        user,
        `${table}?owner_id=eq.${user.id}&${query}${filters}`,
      )) as Record<string, unknown>[],
      limit,
      column,
    );
  }
  if (path === "/sessions" && method === "POST") {
    const body = validate(await jsonBody(request), {
      day_id: uuid,
      name: text(100),
      idempotency_key: { ...uuid, required: true },
    });
    if (body.day_id) {
      const day = await owned(env, user, "workout_days", body.day_id as string);
      const plan = await owned(
        env,
        user,
        "workout_plans",
        day.plan_id as string,
      );
      if (plan.archived_at)
        throw new ApiError(409, "plan_archived", "Plan is archived");
    }
    return {
      id: await database(env, user, "rpc/start_workout", "POST", {
        p_day_id: body.day_id ?? null,
        p_idempotency_key: body.idempotency_key,
        p_name: body.name ?? "Workout",
      }),
    };
  }
  if (path === "/body-metrics" && method === "POST") {
    const body = validate(await jsonBody(request), metricRules);
    if (
      !["weight_kg", "body_fat_percent", "waist_cm", "chest_cm"].some(
        (k) => body[k] !== undefined && body[k] !== null,
      )
    )
      throw new ApiError(
        422,
        "validation_error",
        "Record at least one measurement",
      );
    return database(env, user, "body_metric_entries", "POST", {
      ...body,
      owner_id: user.id,
    });
  }
  if (path === "/progress" && method === "GET")
    return {
      items: await database(
        env,
        user,
        `exercise_progress?owner_id=eq.${user.id}&order=started_at.desc&limit=500`,
      ),
      limit: 500,
    };
  if (path === "/personal-records" && method === "GET")
    return {
      items: await database(
        env,
        user,
        `personal_records?owner_id=eq.${user.id}&limit=200`,
      ),
    };
  let match = path.match(
    /^\/(plans|sessions|custom-exercises|body-metrics)\/([0-9a-f-]+)$/i,
  );
  if (match) {
    const [, resource, id] = match;
    const table =
      resource === "plans"
        ? "workout_plans"
        : resource === "sessions"
          ? "workout_sessions"
          : resource === "custom-exercises"
            ? "user_exercises"
            : "body_metric_entries";
    // GET checks ownership in the same query that reads the record. Mutation
    // paths retain their separate owner lookup before any write.
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      throw new ApiError(422, "validation_error", "Invalid identifier");
    if (method === "GET") {
      const select =
        resource === "plans"
          ? "id,name,description,archived_at,workout_days(id,name,position,planned_exercises(id,exercise_id,user_exercise_id,position,notes,planned_set_targets(id,position,reps,weight_kg,rest_seconds)))"
          : resource === "sessions"
            ? "*,session_exercises(*,performed_sets(*))"
            : "*";
      const rows = (await database(
        env,
        user,
        `${table}?id=eq.${id}&owner_id=eq.${user.id}&select=${select}`,
      )) as unknown[];
      if (!rows.length)
        throw new ApiError(404, "not_found", "Resource not found");
      return rows[0];
    }
    if (method === "PATCH" && resource === "body-metrics") {
      // JWT-derived ownership is enforced by the mutation predicate itself;
      // RLS independently applies. Empty results conceal foreign/missing IDs.
      const rows = await database(env, user,
        `${table}?id=eq.${id}&owner_id=eq.${user.id}`, "PATCH",
        validate(await jsonBody(request), metricRules, true)) as unknown[];
      if (!rows.length) throw new ApiError(404, "not_found", "Resource not found");
      return rows;
    }
    await owned(env, user, table, id);
    if (method === "PATCH" && resource !== "sessions")
      return database(
        env,
        user,
        `${table}?id=eq.${id}&owner_id=eq.${user.id}`,
        "PATCH",
        validate(
          await jsonBody(request),
          resource === "plans"
            ? planRules
            : resource === "custom-exercises"
              ? exerciseRules
              : metricRules,
          true,
        ),
      );
    if (method === "DELETE" && resource === "body-metrics")
      return database(
        env,
        user,
        `${table}?id=eq.${id}&owner_id=eq.${user.id}`,
        "DELETE",
      );
  }
  match = path.match(/^\/sessions\/([0-9a-f-]+)\/(complete|discard)$/i);
  if (match && method === "POST") {
    const session = await owned(env, user, "workout_sessions", match[1]);
    const body = await jsonBody(request);
    if (Object.keys(body).length)
      throw new ApiError(422, "validation_error", "Unexpected field");
    const status = match[2] === "complete" ? "completed" : "discarded";
    if (session.status === status) return session;
    await sessionWritable(env, user, match[1]);
    return database(
      env,
      user,
      `workout_sessions?id=eq.${match[1]}&owner_id=eq.${user.id}&status=eq.in_progress`,
      "PATCH",
      { status, ended_at: new Date().toISOString() },
    );
  }
  match = path.match(
    /^\/(plans|days|planned-exercises|sessions|session-exercises)\/([0-9a-f-]+)\/(days|exercises|targets|sets)$/i,
  );
  if (match && method === "POST") {
    const [, parent, id, child] = match;
    const relationship: Record<
      string,
      [string, string, string, Record<string, Rule>]
    > = {
      "plans/days": ["workout_plans", "workout_days", "plan_id", dayRules],
      "days/exercises": [
        "workout_days",
        "planned_exercises",
        "day_id",
        {
          exercise_id: uuid,
          user_exercise_id: uuid,
          position: number(0, 99, true, true),
          notes: text(2000),
        },
      ],
      "planned-exercises/targets": [
        "planned_exercises",
        "planned_set_targets",
        "planned_exercise_id",
        targetRules,
      ],
      "sessions/exercises": [
        "workout_sessions",
        "session_exercises",
        "session_id",
        {
          exercise_id: uuid,
          user_exercise_id: uuid,
          position: number(0, 99, true, true),
          notes: text(2000),
        },
      ],
      "session-exercises/sets": [
        "session_exercises",
        "performed_sets",
        "session_exercise_id",
        setRules,
      ],
    };
    const config = relationship[`${parent}/${child}`];
    if (!config) throw new ApiError(404, "not_found", "Endpoint not found");
    const [parentTable, table, parentKey, rules] = config;
    const parentRow = await owned(env, user, parentTable, id);
    if (parent === "sessions") await sessionWritable(env, user, id);
    const body = validate(await jsonBody(request), rules);
    if (parent === "session-exercises" && child === "sets") {
      if (!body.id)
        throw new ApiError(
          422,
          "validation_error",
          "Set id is required for retry safety",
        );
      const session = await owned(
        env,
        user,
        "workout_sessions",
        parentRow.session_id as string,
      );
      if (session.status !== "in_progress") {
        const previous = (await database(env, user,
          `performed_sets?id=eq.${body.id}&owner_id=eq.${user.id}&limit=1`)) as unknown[];
        if (!previous.length)
          throw new ApiError(409, "session_closed", "Workout is already closed");
      }
      return database(env, user, "rpc/log_set", "POST", {
        p_id: body.id,
        p_session_exercise_id: id,
        p_position: body.position,
        p_reps: body.reps,
        p_weight_kg: body.weight_kg,
        p_type: body.set_type ?? "working",
        p_rpe: body.rpe ?? null,
        p_notes: body.notes ?? "",
      });
    }
    if (child === "exercises") {
      if (Boolean(body.exercise_id) === Boolean(body.user_exercise_id))
        throw new ApiError(422, "validation_error", "Choose one exercise");
      let name: string;
      if (body.user_exercise_id)
        name = (
          await owned(
            env,
            user,
            "user_exercises",
            body.user_exercise_id as string,
          )
        ).name as string;
      else {
        const catalog = (await database(
          env,
          user,
          `exercises?id=eq.${body.exercise_id}&limit=1`,
        )) as { name: string }[];
        if (!catalog.length)
          throw new ApiError(404, "not_found", "Exercise not found");
        name = catalog[0].name;
      }
      if (parent === "sessions") body.name_snapshot = name;
    }
    return database(env, user, table, "POST", {
      ...body,
      [parentKey]: id,
      owner_id: user.id,
    });
  }
  match = path.match(
    /^\/(days|planned-exercises|targets|sets)\/([0-9a-f-]+)$/i,
  );
  if (match && ["PATCH", "DELETE"].includes(method)) {
    const table =
      match[1] === "days"
        ? "workout_days"
        : match[1] === "planned-exercises"
          ? "planned_exercises"
          : match[1] === "targets"
            ? "planned_set_targets"
            : "performed_sets";
    const row = await owned(env, user, table, match[2]);
    if (table === "performed_sets") {
      const exercise = await owned(
        env,
        user,
        "session_exercises",
        row.session_exercise_id as string,
      );
      await sessionWritable(env, user, exercise.session_id as string);
    }
    const rules =
      match[1] === "days"
        ? dayRules
        : match[1] === "planned-exercises"
          ? { position: number(0, 99, false, true), notes: text(2000) }
          : match[1] === "targets"
            ? targetRules
            : setRules;
    return database(
      env,
      user,
      `${table}?id=eq.${match[2]}&owner_id=eq.${user.id}`,
      method,
      method === "PATCH"
        ? validate(await jsonBody(request), rules, true)
        : undefined,
    );
  }
  throw new ApiError(404, "not_found", "Endpoint not found");
}
