// GitHub's Git ref calls the decision-record lock uses, in memory: creating a
// ref that exists answers 422, reading a missing one 404, and the GraphQL
// updateRefs mutation deletes a ref only if it still points at beforeOid.
// Every call yields to the event loop first, so concurrent writers interleave.

const error = (status: number, message: string) => Object.assign(new Error(message), { status });

export type FakeRefs = {
  refs: Map<string, string>;
  git: {
    createTree: (input: { tree: unknown[] }) => Promise<{ data: { sha: string } }>;
    createCommit: (input: { message: string }) => Promise<{ data: { sha: string } }>;
    createRef: (input: { ref: string; sha: string }) => Promise<{ data: unknown }>;
    getRef: (input: { ref: string }) => Promise<{ data: { ref: string; object: { sha: string } } }>;
  };
  repos: { get: () => Promise<{ data: { node_id: string; default_branch: string } }> };
  graphql: (query: string, variables: Record<string, unknown>) => Promise<unknown>;
  messages: Map<string, string>;
};

export function fakeRefs(): FakeRefs {
  const refs = new Map<string, string>();
  const messages = new Map<string, string>();
  let next = 1;
  const sha = () => (next++).toString(16).padStart(40, "0");
  const tick = () => new Promise((resolve) => setTimeout(resolve, 1));
  return {
    refs,
    messages,
    git: {
      createTree: async () => {
        await tick();
        return { data: { sha: sha() } };
      },
      createCommit: async ({ message }) => {
        await tick();
        const id = sha();
        messages.set(id, message);
        return { data: { sha: id } };
      },
      createRef: async ({ ref, sha: target }) => {
        await tick();
        if (refs.has(ref)) throw error(422, "Reference already exists");
        refs.set(ref, target);
        return { data: {} };
      },
      getRef: async ({ ref }) => {
        await tick();
        const full = `refs/${ref}`;
        const target = refs.get(full);
        if (!target) throw error(404, "Not Found");
        return { data: { ref: full, object: { sha: target } } };
      },
    },
    repos: {
      get: async () => {
        await tick();
        return { data: { node_id: "R_fake", default_branch: "main" } };
      },
    },
    graphql: async (_query, variables) => {
      await tick();
      const input = variables.input as {
        clientMutationId: string;
        refUpdates: { name: string; beforeOid: string; afterOid: string }[];
      };
      for (const update of input.refUpdates) {
        if (refs.get(update.name) !== update.beforeOid) throw error(200, "Ref has moved");
        if (/^0+$/.test(update.afterOid)) refs.delete(update.name);
        else refs.set(update.name, update.afterOid);
      }
      return { updateRefs: { clientMutationId: input.clientMutationId } };
    },
  };
}
