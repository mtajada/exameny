import { assertEquals } from "std/testing/asserts.ts";

import {
  emitSaveUserPreferencesCompletedEvent,
  resetEventsServiceRoleClientFactoryForTests,
  setEventsServiceRoleClientFactoryForTests,
} from "../_shared/events.ts";

const basePayload = {
  request_id: "test-request",
  duration_ms: 120,
  user_id: "user-123",
  target_exam_id: 10,
  target_level_id: 3,
  source: "initial_setup",
};

type EventsClient = ReturnType<
  Parameters<typeof setEventsServiceRoleClientFactoryForTests>[0]
>;
type RpcArgs = Parameters<EventsClient["rpc"]>[1];

const createMockClient = (hooks: {
  onRpc?: (functionName: string, args: RpcArgs) => void;
}): EventsClient => {
  const rpc = ((functionName: string, args: RpcArgs) => {
    hooks.onRpc?.(functionName, args);
    return Promise.resolve({ error: null });
  }) as EventsClient["rpc"];
  return { rpc } as EventsClient;
};

Deno.test("emitSaveUserPreferencesCompletedEvent persists payload by default", async () => {
  const rpcCalls: Array<{ functionName: string; args: RpcArgs }> = [];

  const client = createMockClient({
    onRpc: (functionName, args) => rpcCalls.push({ functionName, args }),
  });

  setEventsServiceRoleClientFactoryForTests(() => client);
  try {
    await emitSaveUserPreferencesCompletedEvent(basePayload);
  } finally {
    resetEventsServiceRoleClientFactoryForTests();
  }

  assertEquals(rpcCalls, [{
    functionName: "enqueue_event_outbox",
    args: {
      p_event_type: "save_user_preferences_completed",
      p_payload: basePayload,
    },
  }]);
});

Deno.test("emitSaveUserPreferencesCompletedEvent honors persist flag", async () => {
  let rpcInvocations = 0;

  const client = createMockClient({
    onRpc: () => {
      rpcInvocations += 1;
    },
  });

  setEventsServiceRoleClientFactoryForTests(() => client);
  try {
    await emitSaveUserPreferencesCompletedEvent(basePayload, {
      persist: false,
    });
  } finally {
    resetEventsServiceRoleClientFactoryForTests();
  }

  assertEquals(rpcInvocations, 0);
});
